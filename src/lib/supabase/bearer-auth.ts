import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Authenticate a request via Bearer token. Used by the `/noticomax push|pull`
 * CLI flow, which can't use cookies.
 *
 * Two token shapes are accepted:
 *   1. Long-lived opaque tokens issued in Settings → Claude Code API tokens.
 *      These start with `sk_nm_` and are looked up by SHA-256 hash in
 *      claude_api_tokens. Preferred for unattended sync — they don't expire.
 *   2. Short-lived Supabase access_tokens (JWT). Validated via
 *      `supabase.auth.getUser(token)`. Backwards-compatible with any caller
 *      still grabbing the access token from a logged-in browser session.
 */
export async function requireBearerUser(request: NextRequest): Promise<
  | { userId: string; error: null }
  | { userId: null; error: NextResponse }
> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      userId: null,
      error: NextResponse.json(
        { error: "Authorization: Bearer <token> required" },
        { status: 401 },
      ),
    };
  }
  const token = match[1].trim();
  const admin = getSupabaseAdminClient();

  if (token.startsWith("sk_nm_")) {
    const hash = createHash("sha256").update(token).digest("hex");
    const { data, error } = await admin
      .from("claude_api_tokens")
      .select("id, user_id")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !data) {
      return {
        userId: null,
        error: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
      };
    }
    // Fire-and-forget — don't block the request on the touch
    void admin
      .from("claude_api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);
    return { userId: data.user_id, error: null };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }),
    };
  }
  return { userId: data.user.id, error: null };
}
