import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST /api/households/respond — body { token, action: "accept" | "decline" }
// Caller must be the invitee. On accept, creates a household_members row;
// on decline, marks the invite as revoked. Idempotent — re-responding to an
// already-responded invite is a no-op.
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
  if (!token || (action !== "accept" && action !== "decline")) {
    return NextResponse.json({ error: "token and action ('accept' | 'decline') required" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: invite } = await admin
    .from("household_invites")
    .select("token, household_id, invited_user_id, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }
  if (invite.invited_user_id !== userId) {
    return NextResponse.json({ error: "This invite isn't for you" }, { status: 403 });
  }
  if (invite.status !== "pending") {
    return NextResponse.json({ error: `Invite already ${invite.status}` }, { status: 400 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    await admin
      .from("household_invites")
      .update({ status: "expired", responded_at: new Date().toISOString() })
      .eq("token", token);
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }

  if (action === "accept") {
    const { error: mErr } = await admin
      .from("household_members")
      .insert({ household_id: invite.household_id, user_id: userId, role: "member" });
    if (mErr) {
      return NextResponse.json({ error: mErr.message }, { status: 500 });
    }
  }

  await admin
    .from("household_invites")
    .update({
      status: action === "accept" ? "accepted" : "revoked",
      responded_at: new Date().toISOString(),
    })
    .eq("token", token);

  return NextResponse.json({ ok: true, householdId: invite.household_id });
}
