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

  // Households owned by the caller — needed so we can fetch pending join
  // requests for them (only the owner sees / acts on requests).
  const ownedHouseholdIds = householdIds.filter((hid) => {
    const m = (myMemberships ?? []).find((mm) => mm.household_id === hid);
    return m?.role === "owner";
  });

  // Fetch household + all member rows + pending invites + pending requests in parallel.
  const [
    { data: households },
    { data: allMembers },
    { data: invites },
    { data: pendingRequests },
  ] = await Promise.all([
    householdIds.length
      ? supabase
          .from("households")
          .select("id, name, owner_user_id, created_at, family_code, max_seats, subscription_plan")
          .in("id", householdIds)
      : Promise.resolve({ data: [] }),
    householdIds.length
      ? supabase.from("household_members").select("household_id, user_id, role, joined_at").in("household_id", householdIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("household_invites")
      .select("token, household_id, invited_email, invited_by, status, expires_at, created_at")
      .eq("invited_user_id", userId)
      .eq("status", "pending"),
    ownedHouseholdIds.length
      ? supabase
          .from("household_invites")
          .select("token, household_id, invited_user_id, invited_by, status, expires_at, created_at")
          .in("household_id", ownedHouseholdIds)
          .eq("status", "requested")
      : Promise.resolve({ data: [] }),
  ]);

  // Resolve member + requester emails via one auth.admin.listUsers call.
  const memberUserIds = Array.from(new Set((allMembers ?? []).map((m) => m.user_id)));
  const requesterUserIds = Array.from(new Set((pendingRequests ?? []).map((r) => r.invited_user_id)));
  const lookupUserIds = Array.from(new Set([...memberUserIds, ...requesterUserIds]));
  let userById: Record<string, { email: string | null }> = {};
  if (lookupUserIds.length) {
    const admin = getSupabaseAdminClient();
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
    userById = Object.fromEntries(
      list.users
        .filter((u) => lookupUserIds.includes(u.id))
        .map((u) => [u.id, { email: u.email ?? null }]),
    );
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

  // Gate: creator must have an active Family Plan (or lifetime Pro grandfathered in).
  // Lifetime Pro users get Family for free since they pre-date the SKU.
  const { data: ent } = await admin
    .from("entitlements")
    .select("family_plan_active, lifetime_pro, extra_seats")
    .eq("user_id", userId)
    .maybeSingle();
  if (!ent?.family_plan_active && !ent?.lifetime_pro) {
    return NextResponse.json(
      { error: "Family Plan required to create a family. Upgrade in Settings → Subscription.", upgradeRequired: true },
      { status: 402 },
    );
  }
  const ownerExtraSeats = ent?.extra_seats ?? 0;

  // family_code + max_seats + subscription_plan default via DB trigger / column defaults.
  // If the owner has purchased extra seats, apply them now (5 base + extras).
  const initialMaxSeats = 5 + ownerExtraSeats;
  const initialPlan = ent?.lifetime_pro ? "family" : "family";
  const { data: household, error: hErr } = await admin
    .from("households")
    .insert({
      name,
      owner_user_id: userId,
      max_seats: initialMaxSeats,
      subscription_plan: initialPlan,
    })
    .select("id, name, owner_user_id, created_at, family_code, max_seats, subscription_plan")
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
    familyCode: household.family_code,
    maxSeats: household.max_seats,
    currentSeats: 1,
    subscriptionPlan: household.subscription_plan,
    role: "owner",
    members: [{ userId, email: claims.claims.email as string, role: "owner", joinedAt: new Date().toISOString() }],
    pendingRequests: [],
  });
}
