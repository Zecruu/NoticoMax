import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/family/checkins";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ folderId: string }> };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });

async function ownerContext(ctx: Context) {
  const { folderId } = await ctx.params;
  if (!isUuid(folderId)) return { response: json({ error: "A valid folder ID is required." }, 400) };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || typeof userId !== "string") return { response: json({ error: "Unauthorized" }, 401) };
  // RLS checks accepted membership, including for the original creator.
  const folder = await supabase.from("folders").select("client_id, user_id, household_id, share_mode").eq("client_id", folderId).maybeSingle();
  if (folder.error) return { response: json({ error: "Could not load folder." }, 503) };
  if (!folder.data || folder.data.user_id !== userId || !folder.data.household_id) {
    return { response: json({ error: "Only an active family folder creator can manage permissions." }, 403) };
  }
  return { supabase, folder: folder.data, folderId };
}

export async function GET(_request: NextRequest, ctx: Context) {
  const owner = await ownerContext(ctx);
  if (owner.response) return owner.response;
  const [members, permissions] = await Promise.all([
    owner.supabase.from("household_members").select("user_id, role, joined_at").eq("household_id", owner.folder.household_id),
    owner.supabase.from("folder_member_permissions").select("user_id, can_read, can_write").eq("folder_id", owner.folderId),
  ]);
  if (members.error || permissions.error) return json({ error: "Could not load permissions." }, 503);
  const admin = getSupabaseAdminClient();
  const enriched = await Promise.all((members.data ?? []).map(async (member) => {
    const { data } = await admin.auth.admin.getUserById(member.user_id);
    return { userId: member.user_id, email: data.user?.email ?? null, role: member.role, joinedAt: member.joined_at };
  }));
  return json({ shareMode: owner.folder.share_mode, householdId: owner.folder.household_id, members: enriched,
    permissions: (permissions.data ?? []).map((p) => ({ userId: p.user_id, canRead: p.can_read, canWrite: p.can_write })) });
}

export async function PUT(request: NextRequest, ctx: Context) {
  const owner = await ownerContext(ctx);
  if (owner.response) return owner.response;
  const body = await request.json().catch(() => null);
  if (!body || (body.shareMode !== undefined && !["all", "select"].includes(body.shareMode)) ||
    (body.permissions !== undefined && (!Array.isArray(body.permissions) || body.permissions.length > 100 ||
      body.permissions.some((p: { userId?: unknown; canRead?: unknown; canWrite?: unknown } | null) =>
        !p || !isUuid(p.userId) || typeof p.canRead !== "boolean" || typeof p.canWrite !== "boolean")))) {
    return json({ error: "A valid sharing mode and member permissions are required." }, 400);
  }
  const { error } = await owner.supabase.rpc("set_family_folder_permissions", {
    p_folder_id: owner.folderId, p_share_mode: body.shareMode ?? null, p_permissions: body.permissions ?? null,
  });
  if (error) return json({ error: "Could not update permissions. Check that you and every selected person are still family members." }, 409);
  return json({ ok: true });
}
