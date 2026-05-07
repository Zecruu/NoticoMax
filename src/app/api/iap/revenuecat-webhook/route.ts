import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import mongoose from "mongoose";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

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

// Must match the RevenueCat dashboard entitlement Identifier exactly
// (case-sensitive).
const PRO_ENTITLEMENT_ID = "Pro";

function constantTimeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export async function POST(request: NextRequest) {
  // Verify shared-secret in Authorization header. RevenueCat lets you set any
  // header value in the webhook config; treat it as a bearer token.
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
  if (!event || !event.type) {
    return NextResponse.json({ error: "Missing event" }, { status: 400 });
  }

  // TEST events are sent when you save the webhook config — ack and exit.
  if (event.type === "TEST") {
    return NextResponse.json({ ok: true, note: "test event acknowledged" });
  }

  // Anonymous IDs only appear if a purchase happens before logIn. Our paywall
  // is gated on Apple sign-in so this shouldn't happen, but ack and skip.
  if (!event.app_user_id || event.app_user_id.startsWith("$RCAnonymousID:")) {
    console.warn(
      "[revenuecat-webhook] anonymous or missing app_user_id, skipping",
      { type: event.type, id: event.id }
    );
    return NextResponse.json({ ok: true, note: "anonymous user, skipped" });
  }

  // app_user_id is the user's Mongo _id (set via Purchases.logIn on the client).
  if (!mongoose.Types.ObjectId.isValid(event.app_user_id)) {
    console.warn("[revenuecat-webhook] app_user_id is not a valid ObjectId", {
      app_user_id: event.app_user_id,
    });
    return NextResponse.json({ ok: true, note: "invalid app_user_id" });
  }

  await dbConnect();

  const user = await User.findById(event.app_user_id);
  if (!user) {
    console.warn("[revenuecat-webhook] user not found", {
      app_user_id: event.app_user_id,
    });
    // 200 so RevenueCat doesn't retry forever; the user simply doesn't exist
    // in our DB (e.g. test event from a different environment).
    return NextResponse.json({ ok: true, note: "user not found" });
  }

  const grantsPro = (event.entitlement_ids ?? []).includes(PRO_ENTITLEMENT_ID);
  const expiresAt = event.expiration_at_ms ? new Date(event.expiration_at_ms) : null;

  // RevenueCat sends an event for every state change. Use the canonical signal:
  // (a) does this event reference our "pro" entitlement at all?
  // (b) what's the expiration timestamp?
  // We don't switch on event.type — RC tells us "entitlement_ids" + "expiration"
  // and we just write the latest snapshot.
  if (grantsPro && expiresAt) {
    user.entitlements.proExpiresAt = expiresAt;
    user.entitlements.proSource = event.store === "PLAY_STORE" ? "stripe" : "apple_iap";
    await user.save();
    console.log("[revenuecat-webhook] updated subscription", {
      userId: user._id.toString(),
      type: event.type,
      expiresAt: expiresAt.toISOString(),
      env: event.environment,
    });
  } else if (event.type === "EXPIRATION" || event.type === "CANCELLATION") {
    // For cancellation, expiration_at_ms is in the future — entitlement still
    // active. For EXPIRATION, the sub is gone. Either way, the snapshot above
    // handles it via the `expiresAt > now` check in computeEntitlements.
    // Only act if RC explicitly says this isn't a pro-grant event.
    if (!grantsPro) {
      // Clear proSource if it was apple_iap; leave proExpiresAt as-is so audit
      // logs show when it expired.
      if (user.entitlements.proSource === "apple_iap") {
        user.entitlements.proSource = undefined;
        await user.save();
      }
      console.log("[revenuecat-webhook] subscription ended", {
        userId: user._id.toString(),
        type: event.type,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
