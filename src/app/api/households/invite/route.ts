import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST /api/households/invite — body { householdId, email }
// Caller must be a member of the household. Email must belong to an existing
// Notico Max user (v1 limitation). Creates a pending invite row.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  const body = await request.json().catch(() => ({}));
  const householdId = typeof body.householdId === "string" ? body.householdId : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!householdId || !email) {
    return NextResponse.json({ error: "householdId and email required" }, { status: 400 });
  }

  // Membership check — caller must already be in this household.
  const { data: myMembership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .eq("household_id", householdId)
    .maybeSingle();
  if (!myMembership) {
    return NextResponse.json({ error: "Not a member of this household" }, { status: 403 });
  }

  if (email === ((claims.claims.email as string | undefined) ?? "").toLowerCase()) {
    return NextResponse.json({ error: "You're already a member" }, { status: 400 });
  }

  // Resolve email → user_id via admin
  const admin = getSupabaseAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const invitedUser = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (!invitedUser) {
    return NextResponse.json(
      { error: "That email isn't a Notico Max user yet. Ask them to sign up first." },
      { status: 404 },
    );
  }

  // Already a member?
  const { data: existingMember } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", householdId)
    .eq("user_id", invitedUser.id)
    .maybeSingle();
  if (existingMember) {
    return NextResponse.json({ error: "That user is already a member" }, { status: 400 });
  }

  // Revoke any prior pending invites to the same user for the same household
  // so the list doesn't grow stale.
  await admin
    .from("household_invites")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .eq("household_id", householdId)
    .eq("invited_user_id", invitedUser.id)
    .eq("status", "pending");

  const { data: invite, error } = await admin
    .from("household_invites")
    .insert({
      household_id: householdId,
      invited_email: email,
      invited_user_id: invitedUser.id,
      invited_by: userId,
    })
    .select("token, expires_at, created_at")
    .single();
  if (error || !invite) {
    return NextResponse.json({ error: error?.message || "Failed to create invite" }, { status: 500 });
  }

  return NextResponse.json({
    token: invite.token,
    expiresAt: invite.expires_at,
    createdAt: invite.created_at,
  });
}
