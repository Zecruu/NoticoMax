import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST /api/households/approve-request — body { token, action: "approve" | "decline" }
// Caller must be the household owner. On approve, seat-count is checked
// against max_seats before adding the member. On decline, the request is
// just marked 'declined' for audit.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const action = body.action;
  if (!token || (action !== "approve" && action !== "decline")) {
    return NextResponse.json(
      { error: "token and action ('approve' | 'decline') required" },
      { status: 400 },
    );
  }

  const admin = getSupabaseAdminClient();

  const { data: invite } = await admin
    .from("household_invites")
    .select("token, household_id, invited_user_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }
  if (invite.status !== "requested") {
    return NextResponse.json({ error: `Request already ${invite.status}` }, { status: 400 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    await admin
      .from("household_invites")
      .update({ status: "expired", responded_at: new Date().toISOString() })
      .eq("token", token);
    return NextResponse.json({ error: "Request expired" }, { status: 400 });
  }

  // Caller must own this household.
  const { data: household } = await admin
    .from("households")
    .select("id, owner_user_id, max_seats")
    .eq("id", invite.household_id)
    .maybeSingle();
  if (!household) {
    return NextResponse.json({ error: "Household not found" }, { status: 404 });
  }
  if (household.owner_user_id !== userId) {
    return NextResponse.json(
      { error: "Only the family admin can approve requests" },
      { status: 403 },
    );
  }

  if (action === "decline") {
    await admin
      .from("household_invites")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("token", token);
    return NextResponse.json({ ok: true, declined: true });
  }

  // Approve path — check seats.
  const { count: currentSeats } = await admin
    .from("household_members")
    .select("user_id", { count: "exact", head: true })
    .eq("household_id", household.id);

  if ((currentSeats ?? 0) >= household.max_seats) {
    return NextResponse.json(
      {
        error: `Family is at the ${household.max_seats}-seat limit. Buy an extra seat or remove a member first.`,
        seatLimit: household.max_seats,
        currentSeats: currentSeats ?? 0,
      },
      { status: 409 },
    );
  }

  // Already a member edge case (somehow joined between request + approval)
  const { data: existingMember } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", household.id)
    .eq("user_id", invite.invited_user_id)
    .maybeSingle();

  if (!existingMember) {
    const { error: mErr } = await admin
      .from("household_members")
      .insert({
        household_id: household.id,
        user_id: invite.invited_user_id,
        role: "member",
      });
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }
  }

  await admin
    .from("household_invites")
    .update({ status: "accepted", responded_at: new Date().toISOString() })
    .eq("token", token);

  return NextResponse.json({ ok: true, approved: true, householdId: household.id });
}
