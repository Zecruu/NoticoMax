import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/family/checkins";
import { parseWorkspaceCommand, workspaceError } from "@/lib/family/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ householdId: string }> };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
async function context(ctx: Context) {
  const { householdId } = await ctx.params;
  if (!isUuid(householdId)) return { response: json({ error: "Invalid family." }, 400) };
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return { response: json({ error: "Sign in to use Family." }, 401) };
  return { householdId, supabase };
}
export async function GET(_request: NextRequest, ctx: Context) {
  const current = await context(ctx); if (current.response) return current.response;
  const { data, error } = await current.supabase.rpc("family_workspace_snapshot", { p_household_id: current.householdId });
  if (error) { const problem = workspaceError(error.message); return json({ error: problem.error }, problem.status); }
  if (!data || data.householdId !== current.householdId || !Array.isArray(data.lists) || !Array.isArray(data.places)) return json({ error: "The Family refresh was incomplete. Please try again." }, 503);
  // Normalize the DB rows at the boundary; clients never supply author identity.
  return json({ ...data, lists: (data.lists ?? []).map((list: Record<string, unknown> & { entries: { id: string; text: string; checked: boolean; revision: number; updated_by: string; updated_at: string }[] }) => ({ ...list,
    entries: list.entries.map((entry) => ({ id: entry.id, text: entry.text, checked: entry.checked, revision: entry.revision, updatedBy: entry.updated_by, updatedAt: entry.updated_at })),
  })), places: (data.places ?? []).map((place: { id: string; title: string; address: string; latitude: number; longitude: number; revision: number; created_by: string; updated_at: string }) => ({
    id: place.id, title: place.title, address: place.address, latitude: place.latitude, longitude: place.longitude, revision: place.revision, createdBy: place.created_by, updatedAt: place.updated_at,
  })) });
}
export async function POST(request: NextRequest, ctx: Context) {
  const current = await context(ctx); if (current.response) return current.response;
  const command = parseWorkspaceCommand(await request.json().catch(() => null));
  if (!command) return json({ error: "Please check the list or place details." }, 400);
  const { supabase, householdId } = current;
  let result;
  switch (command.action) {
    case "create_list": result = await supabase.rpc("create_family_checklist", { p_id: command.id, p_household_id: householdId, p_folder_id: command.folderId, p_title: command.title, p_entries: command.entries }); break;
    case "entry": result = await supabase.rpc("change_family_checklist_entry", { p_item_id: command.listId, p_household_id: householdId, p_entry_id: command.entryId, p_action: command.change, p_text: command.text ?? null, p_checked: command.checked ?? null, p_expected_revision: command.revision ?? null }); break;
    case "delete_list": result = await supabase.rpc("delete_family_checklist", { p_item_id: command.listId, p_household_id: householdId }); break;
    case "save_place": result = await supabase.rpc("save_family_place", { p_id: command.id, p_household_id: householdId, p_title: command.title, p_address: command.address, p_latitude: command.latitude, p_longitude: command.longitude, p_expected_revision: command.revision ?? null }); break;
    case "delete_place": {
      const visible = await supabase.from("family_places").select("id").eq("id", command.id).eq("household_id", householdId).maybeSingle();
      if (visible.error || !visible.data) return json({ error: "This place is no longer available in this family." }, 403);
      result = await supabase.rpc("delete_family_place", { p_id: command.id, p_expected_revision: command.revision }); break;
    }
  }
  if (result.error) { const problem = workspaceError(result.error.message); return json({ error: problem.error }, problem.status); }
  return json({ ok: true, result: result.data });
}
