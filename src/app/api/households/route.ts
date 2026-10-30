import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { familyRpcError } from "@/lib/family/checkins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const { data: myMemberships, error: membershipError } = await supabase
    .from("household_members")
    .select("household_id, role, joined_at")
    .eq("user_id", userId);

  if (membershipError) return NextResponse.json({ error: "Could not load family memberships." }, { status: 503 });

  const householdIds = (myMemberships ?? []).map((m) => m.household_id);

  // Households owned by the caller — needed so we can fetch pending join
  // requests for them (only the owner sees / acts on requests).
  const ownedHouseholdIds = householdIds.filter((hid) => {
    const m = (myMemberships ?? []).find((mm) => mm.household_id === hid);
    return m?.role === "owner";
  });

  // Fetch household + all member rows + pending invites + pending requests in parallel.
  const [
    { data: households, error: householdsError },
    { data: allMembers, error: membersError },
    { data: invites, error: invitesError },
    { data: pendingRequests, error: requestsError },
  ] = await Promise.all([
    householdIds.length
      ? supabase
          .from("households")
          .select("id, name, owner_user_id, created_at, family_code, max_seats, subscription_plan")
          .in("id", householdIds)
      : Promise.resolve({ data: [], error: null }),
    householdIds.length
      ? supabase.from("household_members").select("household_id, user_id, role, joined_at").in("household_id", householdIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("household_invites")
      .select("token, household_id, invited_email, invited_by, status, expires_at, created_at")
      .eq("invited_user_id", userId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
    ownedHouseholdIds.length
      ? supabase
          .from("household_invites")
          .select("token, household_id, invited_user_id, invited_by, status, expires_at, created_at")
          .in("household_id", ownedHouseholdIds)
          .eq("status", "requested")
          .gt("expires_at", new Date().toISOString())
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (householdsError || membersError || invitesError || requestsError) {
    return NextResponse.json({ error: "Could not load family information." }, { status: 503 });
  }

  // Resolve only users already proven visible above; never scan the entire account directory.
  const memberUserIds = Array.from(new Set((allMembers ?? []).map((m) => m.user_id)));
  const requesterUserIds = Array.from(new Set((pendingRequests ?? []).map((r) => r.invited_user_id)));
  const inviterIds = Array.from(new Set((invites ?? []).map((i) => i.invited_by)));
  const lookupUserIds = Array.from(new Set([...memberUserIds, ...requesterUserIds, ...inviterIds])).filter(Boolean);
  let userById: Record<string, { email: string | null }> = {};
  if (lookupUserIds.length) {
    const admin = getSupabaseAdminClient();
    const users = await Promise.all(lookupUserIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      return [id, { email: data.user?.email ?? null }] as const;
    }));
    userById = Object.fromEntries(users);
  }

  const enrichedHouseholds = (households ?? []).map((h) => {
    const myRole = (myMemberships ?? []).find((m) => m.household_id === h.id)?.role ?? "member";
    const members = (allMembers ?? [])
      .filter((m) => m.household_id === h.id)
      .map((m) => ({
        userId: m.user_id,
        email: userById[m.user_id]?.email ?? null,
        role: m.role,
        joinedAt: m.joined_at,
      }));
    // Pending requests are only visible to owners — for non-owners we return []
    const requests =
      myRole === "owner"
        ? (pendingRequests ?? [])
            .filter((r) => r.household_id === h.id)
            .map((r) => ({
              token: r.token,
              userId: r.invited_user_id,
              email: userById[r.invited_user_id]?.email ?? null,
              expiresAt: r.expires_at,
              createdAt: r.created_at,
            }))
        : [];
    return {
      id: h.id,
      name: h.name,
      ownerUserId: h.owner_user_id,
      createdAt: h.created_at,
      familyCode: h.family_code,
      maxSeats: h.max_seats,
      currentSeats: members.length,
      subscriptionPlan: h.subscription_plan,
      role: myRole,
      members,
      pendingRequests: requests,
    };
  });

  // Pending invites also need the inviter's email + household name
  const inviteHouseholdIds = Array.from(new Set((invites ?? []).map((i) => i.household_id)));
  let inviteHouseholdById: Record<string, string> = {};
  if (inviteHouseholdIds.length) {
    const admin = getSupabaseAdminClient();
    const { data: rows, error: inviteNamesError } = await admin
      .from("households")
      .select("id, name")
      .in("id", inviteHouseholdIds);
    if (inviteNamesError) return NextResponse.json({ error: "Could not load family invitations." }, { status: 503 });
    inviteHouseholdById = Object.fromEntries((rows ?? []).map((r) => [r.id, r.name as string]));
  }

  const enrichedInvites = (invites ?? []).map((i) => ({
    token: i.token,
    householdId: i.household_id,
    householdName: inviteHouseholdById[i.household_id] ?? "Unknown",
    invitedByEmail: userById[i.invited_by]?.email ?? null,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }));

  return NextResponse.json({
    households: enrichedHouseholds,
    pendingInvites: enrichedInvites,
  }, { headers: { "Cache-Control": "private, no-store" } });
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
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 60) {
    return NextResponse.json({ error: "Name required (max 60 chars)" }, { status: 400 });
  }

  // Basic family collaboration is free and independent of personal Pro sync.
  // The RPC atomically creates the family, owner membership and default folder,
  // and serializes the one-owned-family limit. Legacy paid seats are preserved.
  const { data: household, error } = await supabase.rpc("create_family_household", { p_name: name });
  if (error) {
    const result = familyRpcError(error);
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  if (!household) {
    return NextResponse.json({ error: "Family creation was not confirmed. Refresh before trying again." }, { status: 503 });
  }

  return NextResponse.json({
    id: household.id,
    name: household.name,
    ownerUserId: household.owner_user_id,
    createdAt: household.created_at,
    familyCode: household.family_code,
    maxSeats: household.max_seats,
    currentSeats: 1,
    subscriptionPlan: household.subscription_plan,
    role: "owner",
    members: [{ userId, email: claims.claims.email as string, role: "owner", joinedAt: new Date().toISOString() }],
    pendingRequests: [],
  });
}
