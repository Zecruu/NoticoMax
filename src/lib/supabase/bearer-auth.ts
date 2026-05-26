import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export type Scope = "skills" | "envvars";
export const ALL_SCOPES: Scope[] = ["skills", "envvars"];

/**
 * Authenticate a request via Bearer token. Used by the `/noticomax` and
 * `/noticomax-env` CLI flows, which can't use cookies.
 *
 * Two token shapes are accepted:
 *   1. Long-lived opaque tokens issued in Settings → Claude Code API tokens.
 *      These start with `sk_nm_` and are looked up by SHA-256 hash in
 *      claude_api_tokens. Each carries its own scope set (skills / envvars).
 *   2. Short-lived Supabase access_tokens (JWT). Validated via
 *      `supabase.auth.getUser(token)`. These represent the full user session
 *      (cookie equivalent) so they get every scope.
 *
 * On hit, last_used_at is touched fire-and-forget so the Settings UI can
 * flag stale tokens.
 */
export async function requireBearerUser(request: NextRequest): Promise<
  | { userId: string; scopes: Scope[]; error: null }
  | { userId: null; scopes: null; error: NextResponse }
> {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return {
      userId: null,
      scopes: null,
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
      .select("id, user_id, scopes")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !data) {
      return {
        userId: null,
        scopes: null,
        error: NextResponse.json({ error: "Invalid token" }, { status: 401 }),
      };
    }
    void admin
      .from("claude_api_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", data.id);
    const scopes = Array.isArray(data.scopes)
      ? (data.scopes.filter((s): s is Scope => ALL_SCOPES.includes(s as Scope)))
      : [];
    return { userId: data.user_id, scopes, error: null };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return {
      userId: null,
      scopes: null,
      error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }),
    };
  }
  return { userId: data.user.id, scopes: [...ALL_SCOPES], error: null };
}

/**
 * Same as requireBearerUser but also asserts the token carries `scope`.
 * Returns 403 when the user is known but the token's scope set excludes
 * the requested capability — distinct from 401 (no/bad token).
 */
export async function requireBearerScope(
  request: NextRequest,
  scope: Scope,
): Promise<
  | { userId: string; scopes: Scope[]; error: null }
  | { userId: null; scopes: null; error: NextResponse }
> {
  const auth = await requireBearerUser(request);
  if (auth.error) return auth;
  if (!auth.scopes.includes(scope)) {
    return {
      userId: null,
      scopes: null,
      error: NextResponse.json(
        { error: `Token missing required scope: ${scope}` },
        { status: 403 },
      ),
    };
  }
  return auth;
}
