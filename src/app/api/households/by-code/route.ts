import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// POST /api/households/by-code — body { code: "XK7P9F" }
// Member types the admin's family code; creates a 'requested' invite row.
// Idempotent: if the user already has a pending request for the same
// household, returns it instead of creating a duplicate. Returns the
// household name so the requester can confirm they're joining the right one.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  const body = await request.json().catch(() => ({}));
  const rawCode = typeof body.code === "string" ? body.code.trim() : "";
  if (!rawCode || rawCode.length < 4 || rawCode.length > 12) {
    return NextResponse.json({ error: "Family code required" }, { status: 400 });
  }
  // Codes are stored uppercase; normalize the input.
  const code = rawCode.toUpperCase();

  const admin = getSupabaseAdminClient();

  // 1) Look up the household.
  const { data: household } = await admin
    .from("households")
    .select("id, name, owner_user_id, max_seats")
    .eq("family_code", code)
    .maybeSingle();

  if (!household) {
    return NextResponse.json({ error: "No family found for that code" }, { status: 404 });
  }

  // 2) Already a member? Tell them, no-op.
  const { data: existingMember } = await admin
    .from("household_members")
    .select("user_id")
    .eq("household_id", household.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existingMember) {
    return NextResponse.json(
      { ok: true, alreadyMember: true, householdId: household.id, householdName: household.name },
    );
  }

  // 3) Pending request already? Idempotent — return that instead.
  const { data: existingRequest } = await admin
    .from("household_invites")
    .select("token, status")
    .eq("household_id", household.id)
    .eq("invited_user_id", userId)
    .eq("status", "requested")
    .maybeSingle();
  if (existingRequest) {
    return NextResponse.json({
      ok: true,
      pending: true,
      token: existingRequest.token,
      householdId: household.id,
      householdName: household.name,
    });
  }

  // 4) Seat-limit check is deferred to approval time — they can still request
  // even if the family is full; admin sees the count and decides.

  // 5) Create the request row.
  const { data: invite, error: insertErr } = await admin
    .from("household_invites")
    .insert({
      household_id: household.id,
      invited_user_id: userId,
      invited_by: userId, // self-initiated
      status: "requested",
      // invited_email left null intentionally
    })
    .select("token, expires_at")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    pending: true,
    token: invite.token,
    householdId: household.id,
    householdName: household.name,
    expiresAt: invite.expires_at,
  });
}
