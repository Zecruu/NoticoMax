import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET /api/households — everything the Settings UI needs in one payload:
//   { households: [{ id, name, role, members: [...] }], pendingInvites: [...] }
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  // The user's memberships → load households + their member rosters
  const { data: myMemberships } = await supabase
    .from("household_members")
    .select("household_id, role, joined_at")
    .eq("user_id", userId);

  const householdIds = (myMemberships ?? []).map((m) => m.household_id);

  // Fetch household + all member rows in two parallel queries
  const [{ data: households }, { data: allMembers }, { data: invites }] = await Promise.all([
    householdIds.length
      ? supabase.from("households").select("id, name, owner_user_id, created_at").in("id", householdIds)
      : Promise.resolve({ data: [] }),
    householdIds.length
      ? supabase.from("household_members").select("household_id, user_id, role, joined_at").in("household_id", householdIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("household_invites")
      .select("token, household_id, invited_email, invited_by, status, expires_at, created_at")
      .eq("invited_user_id", userId)
      .eq("status", "pending"),
  ]);

  // Resolve member email + names via auth.admin.listUsers (one call, filter client-side).
  // For a v1 we just show the email; first name customization comes later.
  const memberUserIds = Array.from(new Set((allMembers ?? []).map((m) => m.user_id)));
  let userById: Record<string, { email: string | null }> = {};
  if (memberUserIds.length) {
    const admin = getSupabaseAdminClient();
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userById = Object.fromEntries(
      list.users
        .filter((u) => memberUserIds.includes(u.id))
        .map((u) => [u.id, { email: u.email ?? null }]),
    );
  }

  const enrichedHouseholds = (households ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    ownerUserId: h.owner_user_id,
    createdAt: h.created_at,
    role: (myMemberships ?? []).find((m) => m.household_id === h.id)?.role ?? "member",
    members: (allMembers ?? [])
      .filter((m) => m.household_id === h.id)
      .map((m) => ({
        userId: m.user_id,
        email: userById[m.user_id]?.email ?? null,
        role: m.role,
        joinedAt: m.joined_at,
      })),
  }));

  // Pending invites also need the inviter's email + household name
  const inviterIds = Array.from(new Set((invites ?? []).map((i) => i.invited_by)));
  const inviteHouseholdIds = Array.from(new Set((invites ?? []).map((i) => i.household_id)));
  let inviterById: Record<string, string | null> = {};
  let inviteHouseholdById: Record<string, string> = {};
  if (inviterIds.length) {
    const admin = getSupabaseAdminClient();
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    inviterById = Object.fromEntries(
      list.users
        .filter((u) => inviterIds.includes(u.id))
        .map((u) => [u.id, u.email ?? null]),
    );
  }
  if (inviteHouseholdIds.length) {
    const admin = getSupabaseAdminClient();
    const { data: rows } = await admin
      .from("households")
      .select("id, name")
      .in("id", inviteHouseholdIds);
    inviteHouseholdById = Object.fromEntries((rows ?? []).map((r) => [r.id, r.name as string]));
  }

  const enrichedInvites = (invites ?? []).map((i) => ({
    token: i.token,
    householdId: i.household_id,
    householdName: inviteHouseholdById[i.household_id] ?? "Unknown",
    invitedByEmail: inviterById[i.invited_by] ?? null,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }));

  return NextResponse.json({
    households: enrichedHouseholds,
    pendingInvites: enrichedInvites,
  });
}

// POST /api/households — body { name }
// Creates a household with the caller as the owner + first member.
export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Name required (max 60 chars)" }, { status: 400 });
  }

  // Use admin to perform the insert + membership atomically. RLS on
  // households allows the owner insert, but the members insert has no policy
  // (intentional — only the server should add members).
  const admin = getSupabaseAdminClient();

  const { data: household, error: hErr } = await admin
    .from("households")
    .insert({ name, owner_user_id: userId })
    .select("id, name, owner_user_id, created_at")
    .single();
  if (hErr || !household) {
    return NextResponse.json({ error: hErr?.message || "Failed to create" }, { status: 500 });
  }

  const { error: mErr } = await admin
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId, role: "owner" });
  if (mErr) {
    // Best-effort cleanup if member insert failed
    await admin.from("households").delete().eq("id", household.id);
    return NextResponse.json({ error: mErr.message }, { status: 500 });
  }

  return NextResponse.json({
    id: household.id,
    name: household.name,
    ownerUserId: household.owner_user_id,
    createdAt: household.created_at,
    role: "owner",
    members: [{ userId, email: claims.claims.email as string, role: "owner", joinedAt: new Date().toISOString() }],
  });
}
