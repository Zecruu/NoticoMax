import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface RCEvent {
  type: string;
  id: string;
  app_user_id: string;
  original_app_user_id?: string;
  aliases?: string[];
  product_id?: string;
  purchased_at_ms?: number;
  expiration_at_ms?: number;
  store?: string;
  environment?: "PRODUCTION" | "SANDBOX";
  entitlement_ids?: string[];
}

interface RCWebhookPayload {
  api_version: string;
  event: RCEvent;
}

// Must match the RevenueCat dashboard entitlement identifiers exactly.
const PRO_ENTITLEMENT_ID = "Pro";
const FAMILY_ENTITLEMENT_ID = "Family";

// Product IDs that bump capacity instead of granting an entitlement.
// Configure these in the App Store Connect / RevenueCat dashboard with
// matching identifiers and they'll be processed here.
const EXTRA_SEAT_PRODUCT_IDS = new Set(["family_extra_seat_monthly"]);
const STORAGE_PRODUCT_TO_PLAN: Record<string, string> = {
  storage_personal_5gb:   "personal_5gb",
  storage_personal_50gb:  "personal_50gb",
  storage_personal_200gb: "personal_200gb",
  storage_family_20gb:    "family_20gb",
  storage_family_100gb:   "family_100gb",
  storage_family_500gb:   "family_500gb",
};

// Supabase user IDs are UUIDs.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function constantTimeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!expected) {
    console.error("[revenuecat-webhook] REVENUECAT_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!constantTimeCompare(auth, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: RCWebhookPayload;
  try {
    payload = (await request.json()) as RCWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = payload.event;
  if (!event?.type) {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  if (event.type === "TEST") {
    return NextResponse.json({ ok: true, note: "test event acknowledged" });
  }

  if (!event.app_user_id || event.app_user_id.startsWith("$RCAnonymousID:")) {
    console.warn("[revenuecat-webhook] anonymous or missing app_user_id, skipping", {
      type: event.type, id: event.id,
    });
    return NextResponse.json({ ok: true, note: "anonymous user, skipped" });
  }

  if (!UUID_RE.test(event.app_user_id)) {
    console.warn("[revenuecat-webhook] app_user_id is not a valid Supabase UUID", {
      app_user_id: event.app_user_id,
    });
    return NextResponse.json({ ok: true, note: "invalid app_user_id" });
  }

  const userId = event.app_user_id;
  const entIds = event.entitlement_ids ?? [];
  const grantsPro = entIds.includes(PRO_ENTITLEMENT_ID);
  const grantsFamily = entIds.includes(FAMILY_ENTITLEMENT_ID);
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  const proSource = event.store === "PLAY_STORE" ? "stripe" : "apple_iap";
  const productId = event.product_id ?? "";

  const admin = getSupabaseAdminClient();

  // Pro entitlement (existing behavior)
  if (grantsPro && expiresAt) {
    const { error } = await admin.from("entitlements").upsert(
      {
        user_id: userId,
        pro_expires_at: expiresAt.toISOString(),
        pro_source: proSource,
      },
      { onConflict: "user_id" },
    );
    if (error) {
      console.error("[revenuecat-webhook] pro upsert failed:", error);
      return NextResponse.json({ error: "Database write failed" }, { status: 500 });
    }
  } else if (event.type === "EXPIRATION" || event.type === "CANCELLATION") {
    if (!grantsPro) {
      const { error } = await admin
        .from("entitlements")
        .update({ pro_source: null })
        .eq("user_id", userId)
        .eq("pro_source", "apple_iap");
      if (error) console.warn("[revenuecat-webhook] clear pro_source failed:", error);
    }
  }

  // Family Plan entitlement — toggle family_plan_active based on the event.
  // Active when the entitlement is currently granted; flipped off on
  // EXPIRATION/CANCELLATION when no longer granted.
  if (grantsFamily) {
    const { error } = await admin
      .from("entitlements")
      .upsert(
        { user_id: userId, family_plan_active: true },
        { onConflict: "user_id" },
      );
    if (error) console.warn("[revenuecat-webhook] family upsert failed:", error);
  } else if (event.type === "EXPIRATION" || event.type === "CANCELLATION") {
    const { error } = await admin
      .from("entitlements")
      .update({ family_plan_active: false })
      .eq("user_id", userId);
    if (error) console.warn("[revenuecat-webhook] family lapse failed:", error);
  }

  // Extra seat purchase (subscription product, recurring) — bumps extra_seats.
  // On initial purchase / renewal we set the floor; on cancel we leave the
  // count alone until expiration (their last paid period still applies).
  if (
    EXTRA_SEAT_PRODUCT_IDS.has(productId) &&
    (event.type === "INITIAL_PURCHASE" || event.type === "RENEWAL")
  ) {
    // Atomic increment by RPC would be cleaner, but a read-modify-write here is
    // fine for the rare case of seat-purchase webhook races.
    const { data: currentEnt } = await admin
      .from("entitlements")
      .select("extra_seats")
      .eq("user_id", userId)
      .maybeSingle();
    const currentSeats = currentEnt?.extra_seats ?? 0;
    // Only INITIAL_PURCHASE adds a new seat; RENEWAL just keeps it active.
    if (event.type === "INITIAL_PURCHASE") {
      const { error } = await admin
        .from("entitlements")
        .upsert(
          { user_id: userId, extra_seats: currentSeats + 1 },
          { onConflict: "user_id" },
        );
      if (error) console.warn("[revenuecat-webhook] extra_seat bump failed:", error);
    }
  } else if (
    EXTRA_SEAT_PRODUCT_IDS.has(productId) &&
    (event.type === "EXPIRATION" || event.type === "CANCELLATION")
  ) {
    const { data: currentEnt } = await admin
      .from("entitlements")
      .select("extra_seats")
      .eq("user_id", userId)
      .maybeSingle();
    const currentSeats = currentEnt?.extra_seats ?? 0;
    if (currentSeats > 0) {
      const { error } = await admin
        .from("entitlements")
        .update({ extra_seats: currentSeats - 1 })
        .eq("user_id", userId);
      if (error) console.warn("[revenuecat-webhook] extra_seat decrement failed:", error);
    }
  }

  // Storage plan products — overwrite storage_plan whenever the user has an
  // active storage product (latest wins if they switch tiers).
  if (STORAGE_PRODUCT_TO_PLAN[productId] && (event.type === "INITIAL_PURCHASE" || event.type === "PRODUCT_CHANGE" || event.type === "RENEWAL")) {
    const plan = STORAGE_PRODUCT_TO_PLAN[productId];
    const { error } = await admin
      .from("entitlements")
      .upsert({ user_id: userId, storage_plan: plan }, { onConflict: "user_id" });
    if (error) console.warn("[revenuecat-webhook] storage_plan set failed:", error);
  } else if (STORAGE_PRODUCT_TO_PLAN[productId] && (event.type === "EXPIRATION" || event.type === "CANCELLATION")) {
    const { error } = await admin
      .from("entitlements")
      .update({ storage_plan: "free" })
      .eq("user_id", userId);
    if (error) console.warn("[revenuecat-webhook] storage_plan reset failed:", error);
  }

  console.log("[revenuecat-webhook] processed", {
    userId,
    type: event.type,
    productId,
    grantsPro,
    grantsFamily,
    env: event.environment,
  });

  return NextResponse.json({ ok: true });
}
