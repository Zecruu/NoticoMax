import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Authenticate a request via Bearer token (Supabase access_token).
 *
 * Used by the `/noticomax push|pull` CLI flow, which can't use cookies.
 * The CLI fetches the user's Supabase session from browser localStorage and
 * passes the access_token as `Authorization: Bearer <token>`.
 *
 * Returns either { userId, error: null } or { userId: null, error: NextResponse }.
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
        { error: "Authorization: Bearer <access_token> required" },
        { status: 401 },
      ),
    };
  }
  const token = match[1].trim();

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    return {
      userId: null,
      error: NextResponse.json({ error: "Invalid or expired token" }, { status: 401 }),
    };
  }

  return { userId: data.user.id, error: null };
}
