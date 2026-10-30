import { isUuid } from "./checkins.ts";

export interface FamilyListEntry { id: string; text: string; checked: boolean; revision: number; updatedBy: string | null; updatedAt: string }
export interface FamilyList { id: string; title: string; folderId: string; canWrite: boolean; updatedAt: string; entries: FamilyListEntry[] }
export interface FamilyPlace { id: string; title: string; address: string; latitude: number; longitude: number; revision: number; createdBy: string | null; updatedAt: string }
export interface FamilyWorkspace { householdId: string; userId: string; refreshedAt: string; lists: FamilyList[]; places: FamilyPlace[] }
export type WorkspaceCommand =
  | { action: "create_list"; id: string; folderId: string; title: string; entries: { id: string; text: string }[] }
  | { action: "entry"; listId: string; entryId: string; change: "add" | "set_checked" | "rename" | "delete"; text?: string; checked?: boolean; revision?: number }
  | { action: "save_place"; id: string; title: string; address: string; latitude: number; longitude: number; revision?: number }
  | { action: "delete_list"; listId: string }
  | { action: "delete_place"; id: string; revision: number };
const validText = (value: unknown, max: number): value is string => typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
const validRevision = (value: unknown): value is number => Number.isInteger(value) && Number(value) > 0;
export function parseWorkspaceCommand(value: unknown): WorkspaceCommand | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (body.action === "create_list" && isUuid(body.id) && isUuid(body.folderId) && validText(body.title, 120) && Array.isArray(body.entries) && body.entries.length <= 200) {
    const entries: { id: string; text: string }[] = [];
    for (const entry of body.entries) {
      if (!entry || !isUuid(entry.id) || !validText(entry.text, 500) || entries.some((e) => e.id === entry.id)) return null;
      entries.push({ id: entry.id, text: entry.text.trim() });
    }
    return { action: body.action, id: body.id, folderId: body.folderId, title: body.title.trim(), entries };
  }
  if (body.action === "entry" && isUuid(body.listId) && isUuid(body.entryId)) {
    if (body.change === "add" && validText(body.text, 500)) return { action: "entry", change: "add", listId: body.listId, entryId: body.entryId, text: body.text.trim() };
    if (!validRevision(body.revision)) return null;
    const base = { action: "entry" as const, listId: body.listId, entryId: body.entryId, revision: body.revision };
    if (body.change === "set_checked" && typeof body.checked === "boolean") return { ...base, change: body.change, checked: body.checked };
    if (body.change === "rename" && validText(body.text, 500)) return { ...base, change: body.change, text: body.text.trim() };
    if (body.change === "delete") return { ...base, change: "delete" };
  }
  if (body.action === "save_place" && isUuid(body.id) && validText(body.title, 120)
    && typeof body.address === "string" && body.address.length <= 500
    && typeof body.latitude === "number" && Number.isFinite(body.latitude) && Math.abs(body.latitude) <= 90
    && typeof body.longitude === "number" && Number.isFinite(body.longitude) && Math.abs(body.longitude) <= 180
    && (body.revision === undefined || validRevision(body.revision))) {
    return { action: body.action, id: body.id, title: body.title.trim(), address: body.address.trim(), latitude: body.latitude, longitude: body.longitude, revision: body.revision as number | undefined };
  }
  if (body.action === "delete_list" && isUuid(body.listId)) return { action: body.action, listId: body.listId };
  if (body.action === "delete_place" && isUuid(body.id) && validRevision(body.revision)) return { action: body.action, id: body.id, revision: body.revision };
  return null;
}
export function workspaceError(message?: string): { status: number; error: string } {
  if (["family_entry_conflict", "family_place_conflict"].includes(message ?? "")) return { status: 409, error: "Someone changed this just now. We refreshed it; review the latest version and try again." };
  if (["family_read_only", "family_list_unavailable", "family_membership_required", "family_place_unavailable"].includes(message ?? "")) return { status: 403, error: "You no longer have permission to change this. Refresh Family access." };
  if (message === "family_list_too_long") return { status: 400, error: "This checklist has reached 200 entries. Start another list." };
  if (message === "family_entry_missing") return { status: 409, error: "That entry was removed. We refreshed the list." };
  return { status: 503, error: "The change could not be confirmed. Refresh before trying again; your draft is kept open." };
}
export const checklistProgress = (list: FamilyList) => ({ complete: list.entries.filter((entry) => entry.checked).length, total: list.entries.length });
