import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { familyRpcError, isUuid, parseFamilyCheckin } from "@/lib/family/checkins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ householdId: string }> };

function json(body: unknown, status = 200) {
  // Locations are never an HTTP cache, service-worker cache, or offline queue.
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

async function memberContext(context: RouteContext) {
  const { householdId } = await context.params;
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return { response: json({ error: "Unauthorized" }, 401) };
  if (!isUuid(householdId)) return { response: json({ error: "Invalid family ID." }, 400) };
  const membership = await supabase.from("household_members")
    .select("household_id").eq("household_id", householdId).eq("user_id", userId).maybeSingle();
  if (membership.error) return { response: json({ error: "Could not verify family membership." }, 503) };
  if (!membership.data) return { response: json({ error: "You are not a member of this family." }, 403) };
  return { supabase, householdId, userId };
}

function toCheckin(row: {
  user_id: string; latitude: number; longitude: number; accuracy: number | null;
  captured_at: string; shared_at: string; expires_at: string;
}) {
  return {
    userId: row.user_id, latitude: row.latitude, longitude: row.longitude, accuracy: row.accuracy,
    capturedAt: row.captured_at, sharedAt: row.shared_at, expiresAt: row.expires_at,
  };
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const member = await memberContext(context);
  if (member.response) return member.response;
  const { supabase, householdId, userId } = member;
  const [preference, checkins] = await Promise.all([
    supabase.from("family_location_preferences").select("enabled")
      .eq("household_id", householdId).eq("user_id", userId).maybeSingle(),
    supabase.from("family_checkins")
      .select("user_id, latitude, longitude, accuracy, captured_at, shared_at, expires_at")
      .eq("household_id", householdId).gt("expires_at", new Date().toISOString())
      .order("shared_at", { ascending: false }),
  ]);
  if (preference.error || checkins.error) return json({ error: "Could not load family check-ins." }, 503);
  return json({ userId, sharingEnabled: preference.data?.enabled === true, checkins: (checkins.data ?? []).map(toCheckin) });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const member = await memberContext(context);
  if (member.response) return member.response;
  const body = await request.json().catch(() => null);
  if (!body || typeof body.enabled !== "boolean") return json({ error: "An explicit sharing choice is required." }, 400);
  const { data, error } = await member.supabase.rpc("set_family_location_sharing", {
    p_household_id: member.householdId, p_enabled: body.enabled,
  });
  if (error) { const result = familyRpcError(error); return json({ error: result.error }, result.status); }
  return json({ sharingEnabled: data === true });
}

export async function POST(request: NextRequest, context: RouteContext) {
  const member = await memberContext(context);
  if (member.response) return member.response;
  const parsed = parseFamilyCheckin(await request.json().catch(() => null));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const { latitude, longitude, accuracy, capturedAt } = parsed.checkin;
  const { data, error } = await member.supabase.rpc("share_family_checkin", {
    p_household_id: member.householdId, p_latitude: latitude, p_longitude: longitude,
    p_accuracy: accuracy, p_captured_at: capturedAt,
  });
  if (error) { const result = familyRpcError(error); return json({ error: result.error }, result.status); }
  if (!data) return json({ error: "The check-in was not confirmed. Refresh before trying again." }, 503);
  return json({ checkin: toCheckin(data) });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const member = await memberContext(context);
  if (member.response) return member.response;
  const { error } = await member.supabase.rpc("revoke_family_checkin", { p_household_id: member.householdId });
  if (error) { const result = familyRpcError(error); return json({ error: result.error }, result.status); }
  return json({ ok: true });
}
