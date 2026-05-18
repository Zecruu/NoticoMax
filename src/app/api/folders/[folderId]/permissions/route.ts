import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// GET /api/folders/[folderId]/permissions
// Returns:
//   {
//     shareMode: "all" | "select",
//     householdId: string | null,
//     members: [{ userId, email, role, joinedAt }],
//     permissions: [{ userId, canRead, canWrite }]
//   }
// Caller must own the folder OR be the household admin.
export async function GET(_request: NextRequest, ctx: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await ctx.params;
  if (!folderId) {
    return NextResponse.json({ error: "folderId required" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  const admin = getSupabaseAdminClient();

  const { data: folder } = await admin
    .from("folders")
    .select("client_id, user_id, household_id, share_mode")
    .eq("client_id", folderId)
    .maybeSingle();

  if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  if (folder.user_id !== userId) {
    return NextResponse.json({ error: "Only the folder owner can manage permissions" }, { status: 403 });
  }

  // Members of the folder's household (if any) — admin needs this list to pick from.
  let members: { userId: string; email: string | null; role: string; joinedAt: string }[] = [];
  if (folder.household_id) {
    const { data: rawMembers } = await admin
      .from("household_members")
      .select("user_id, role, joined_at")
      .eq("household_id", folder.household_id);
    const memberUserIds = (rawMembers ?? []).map((m) => m.user_id);
    const { data: userList } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const emailById = Object.fromEntries(
      userList.users.filter((u) => memberUserIds.includes(u.id)).map((u) => [u.id, u.email ?? null]),
    );
    members = (rawMembers ?? []).map((m) => ({
      userId: m.user_id,
      email: emailById[m.user_id] ?? null,
      role: m.role,
      joinedAt: m.joined_at,
    }));
  }

  const { data: perms } = await admin
    .from("folder_member_permissions")
    .select("user_id, can_read, can_write")
    .eq("folder_id", folderId);

  return NextResponse.json({
    shareMode: folder.share_mode,
    householdId: folder.household_id,
    members,
    permissions: (perms ?? []).map((p) => ({
      userId: p.user_id,
      canRead: p.can_read,
      canWrite: p.can_write,
    })),
  });
}

// PUT /api/folders/[folderId]/permissions
// Body: { shareMode?: "all" | "select", permissions?: [{ userId, canRead, canWrite }] }
// Replaces the entire permissions set for the folder. Pass an empty permissions
// array to clear all overrides. Caller must own the folder.
export async function PUT(request: NextRequest, ctx: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await ctx.params;
  if (!folderId) {
    return NextResponse.json({ error: "folderId required" }, { status: 400 });
  }

  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  const body = await request.json().catch(() => ({}));
  const shareMode = body.shareMode as "all" | "select" | undefined;
  const permissions = Array.isArray(body.permissions) ? body.permissions : undefined;

  if (shareMode && shareMode !== "all" && shareMode !== "select") {
    return NextResponse.json({ error: "shareMode must be 'all' or 'select'" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const { data: folder } = await admin
    .from("folders")
    .select("client_id, user_id, household_id")
    .eq("client_id", folderId)
    .maybeSingle();

  if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  if (folder.user_id !== userId) {
    return NextResponse.json({ error: "Only the folder owner can manage permissions" }, { status: 403 });
  }

  if (shareMode) {
    const { error } = await admin
      .from("folders")
      .update({ share_mode: shareMode, updated_at: new Date().toISOString() })
      .eq("client_id", folderId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (permissions !== undefined) {
    // Replace-all: wipe existing rows, insert the new set in one shot.
    await admin.from("folder_member_permissions").delete().eq("folder_id", folderId);
    if (permissions.length > 0) {
      const rows = permissions.map((p: { userId: string; canRead?: boolean; canWrite?: boolean }) => ({
        folder_id: folderId,
        user_id: p.userId,
        can_read: p.canRead ?? true,
        can_write: p.canWrite ?? true,
      }));
      const { error } = await admin.from("folder_member_permissions").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
