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

// Must match the RevenueCat dashboard entitlement identifier exactly.
const PRO_ENTITLEMENT_ID = "Pro";

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
  const grantsPro = (event.entitlement_ids ?? []).includes(PRO_ENTITLEMENT_ID);
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;
  const proSource = event.store === "PLAY_STORE" ? "stripe" : "apple_iap";

  const admin = getSupabaseAdminClient();

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
      console.error("[revenuecat-webhook] upsert failed:", error);
      return NextResponse.json({ error: "Database write failed" }, { status: 500 });
    }
    console.log("[revenuecat-webhook] updated subscription", {
      userId, type: event.type, expiresAt: expiresAt.toISOString(), env: event.environment,
    });
  } else if (event.type === "EXPIRATION" || event.type === "CANCELLATION") {
    if (!grantsPro) {
      // Clear pro_source so the next /api/auth/me reflects the lapse.
      // Leave pro_expires_at as the historical timestamp.
      const { error } = await admin
        .from("entitlements")
        .update({ pro_source: null })
        .eq("user_id", userId)
        .eq("pro_source", "apple_iap");
      if (error) console.warn("[revenuecat-webhook] clear pro_source failed:", error);
      console.log("[revenuecat-webhook] subscription ended", { userId, type: event.type });
    }
  }

  return NextResponse.json({ ok: true });
}
