import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Permanently deletes the signed-in user's Supabase auth account.
 *
 * Cascading deletes on the schema (entitlements, folders, items, legacy_auth)
 * remove all owned rows automatically; licenses keep their record but
 * `user_id` is set to NULL so the buyer can re-link.
 *
 * Required for App Store guideline 5.1.1(v).
 */
export async function POST() {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims?.sub) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = claims.claims.sub as string;

  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[auth/delete-account] deleteUser failed:", error);
    return NextResponse.json({ error: "Account deletion failed" }, { status: 500 });
  }

  // Sign the caller out so their cookies are cleared on the response.
  await supabase.auth.signOut();

  return NextResponse.json({ success: true });
}
