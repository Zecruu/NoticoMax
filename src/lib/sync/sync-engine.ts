import db, {
  type LocalItem,
  type LocalFolder,
  type LocalLocation,
  type LocalBudgetCategory,
  type LocalBudgetTransaction,
  type LocalBudgetCategoryOverride,
  type LocalGoal,
  type GoalScope,
} from "@/lib/db/indexed-db";
import { v4 as uuidv4 } from "uuid";
import {
  scheduleReminderNotification,
  cancelReminderNotification,
} from "@/lib/capacitor/local-notifications";
import { getDeviceId, saveDeviceNameMapping, getDeviceName } from "@/lib/device";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AuthChangeEvent, Session, RealtimeChannel } from "@supabase/supabase-js";

const SYNC_KEY = "notico_last_sync";

// Personal Pro sync and free Family collaboration are separate entitlements.
let syncEnabled = false;
let familyUserId: string | null = null;
let currentUserId: string | null = null;
let syncGeneration = 0;

export function setSyncContext(personalEnabled: boolean, userId: string | null) {
  if (familyUserId !== userId || syncEnabled !== personalEnabled) {
    syncGeneration++;
    teardownRealtime();
  }
  const previousUser = familyUserId;
  syncEnabled = personalEnabled;
  familyUserId = userId;
  currentUserId = userId;
  if (previousUser && previousUser !== userId) {
    void clearFamilyCache().then(notifySyncComplete).catch((error) => console.error("Could not clear Family cache", error));
  }
}

export function setSyncEnabled(enabled: boolean) {
  setSyncContext(enabled, familyUserId);
}

/** Backward compatibility; this never grants free access to personal sync. */
export function setSyncLicenseKey(key: string | null) { setSyncEnabled(!!key); }

async function getCurrentUserId(): Promise<string | null> {
  const { data, error } = await getSupabaseBrowserClient().auth.getUser();
  if (error) throw error;
  const id = data.user?.id ?? null;
  if (familyUserId && id !== familyUserId) return null;
  currentUserId = id;
  return id;
}

async function clearFamilyCache() {
  const items = (await db.items.toArray()).filter((row) => !!row.householdId);
  const folders = (await db.folders.toArray()).filter((row) => !!row.householdId);
  await db.transaction("rw", db.items, db.folders, db.syncQueue, async () => {
    for (const row of items) {
      await db.items.where("clientId").equals(row.clientId).delete();
      await db.syncQueue.where("clientId").equals(row.clientId).delete();
    }
    for (const row of folders) {
      await db.folders.where("clientId").equals(row.clientId).delete();
      await db.syncQueue.where("clientId").equals(row.clientId).delete();
    }
  });
  for (const row of items) cancelReminderNotification(row.clientId);
}

// ─── FIELD MAPPING (LocalItem ↔ Supabase row) ───

interface SupabaseItem {
  client_id: string;
  user_id: string;
  type: string;
  is_checklist?: boolean;
  title: string;
  content: string;
  url: string | null;
  reminder_date: string | null;
  reminder_completed: boolean | null;
  recurrence: string | null;
  tags: string[];
  pinned: boolean;
  color: string | null;
  folder_id: string | null;
  household_id: string | null;
  device_id: string | null;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseFolder {
  client_id: string;
  user_id: string;
  name: string;
  color: string | null;
  household_id: string | null;
  share_mode: "all" | "select" | null;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseLocation {
  client_id: string;
  user_id: string;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  notes: string | null;
  tags: string[];
  pinned: boolean;
  color: string | null;
  household_id: string | null;
  device_id: string | null;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function localToSupabaseItem(item: LocalItem, userId: string): Partial<SupabaseItem> {
  return {
    client_id: item.clientId,
    user_id: item.ownerUserId ?? userId,
    type: item.type,
    is_checklist: item.isChecklist ?? false,
    title: item.title,
    content: item.content,
    url: item.url ?? null,
    reminder_date: item.reminderDate ?? null,
    reminder_completed: item.reminderCompleted ?? null,
    recurrence: item.recurrence ?? null,
    tags: item.tags ?? [],
    pinned: item.pinned ?? false,
    color: item.color ?? null,
    folder_id: item.folderId ?? null,
    household_id: item.householdId ?? null,
    device_id: item.deviceId ?? null,
    deleted: item.deleted ?? false,
    deleted_at: item.deletedAt ?? null,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

function supabaseToLocalItem(row: SupabaseItem): LocalItem {
  return {
    clientId: row.client_id,
    serverId: row.client_id,
    ownerUserId: row.user_id,
    familyAccountId: row.household_id ? familyUserId ?? undefined : undefined,
    type: row.type as LocalItem["type"],
    isChecklist: row.is_checklist ?? false,
    title: row.title,
    content: row.content ?? "",
    url: row.url ?? undefined,
    reminderDate: row.reminder_date ?? undefined,
    reminderCompleted: row.reminder_completed ?? undefined,
    recurrence: (row.recurrence as LocalItem["recurrence"]) ?? undefined,
    tags: row.tags ?? [],
    pinned: row.pinned ?? false,
    color: row.color ?? undefined,
    folderId: row.folder_id ?? undefined,
    householdId: row.household_id ?? undefined,
    deviceId: row.device_id ?? undefined,
    deleted: row.deleted ?? false,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function localToSupabaseFolder(folder: LocalFolder, userId: string): Partial<SupabaseFolder> {
  return {
    client_id: folder.clientId,
    user_id: folder.ownerUserId ?? userId,
    name: folder.name,
    color: folder.color ?? null,
    household_id: folder.householdId ?? null,
    share_mode: folder.shareMode ?? "all",
    deleted: folder.deleted ?? false,
    created_at: folder.createdAt,
    updated_at: folder.updatedAt,
  };
}

function supabaseToLocalFolder(row: SupabaseFolder): LocalFolder {
  return {
    clientId: row.client_id,
    serverId: row.client_id,
    ownerUserId: row.user_id,
    familyAccountId: row.household_id ? familyUserId ?? undefined : undefined,
    name: row.name,
    color: row.color ?? undefined,
    householdId: row.household_id ?? undefined,
    shareMode: (row.share_mode as LocalFolder["shareMode"]) ?? undefined,
    deleted: row.deleted ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function localToSupabaseLocation(loc: LocalLocation, userId: string): Partial<SupabaseLocation> {
  return {
    client_id: loc.clientId,
    user_id: userId,
    name: loc.name,
    address: loc.address ?? null,
    latitude: loc.latitude,
    longitude: loc.longitude,
    notes: loc.notes ?? null,
    tags: loc.tags ?? [],
    pinned: loc.pinned ?? false,
    color: loc.color ?? null,
    household_id: loc.householdId ?? null,
    device_id: loc.deviceId ?? null,
    deleted: loc.deleted ?? false,
    deleted_at: loc.deletedAt ?? null,
    created_at: loc.createdAt,
    updated_at: loc.updatedAt,
  };
}

function supabaseToLocalLocation(row: SupabaseLocation): LocalLocation {
  return {
    clientId: row.client_id,
    name: row.name,
    address: row.address ?? undefined,
    latitude: row.latitude,
    longitude: row.longitude,
    notes: row.notes ?? undefined,
    tags: row.tags ?? [],
    pinned: row.pinned ?? false,
    color: row.color ?? undefined,
    householdId: row.household_id ?? undefined,
    deviceId: row.device_id ?? undefined,
    deleted: row.deleted ?? false,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── BUDGET (categories, transactions, monthly-income settings) ───

interface SupabaseBudgetCategory {
  client_id: string;
  user_id: string;
  name: string;
  color: string;
  monthly_limit: number;
  household_id: string | null;
  device_id: string | null;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupabaseBudgetTransaction {
  client_id: string;
  user_id: string;
  category_id: string;
  amount: number;
  note: string | null;
  date: string;
  household_id: string | null;
  device_id: string | null;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}



function localToSupabaseBudgetCategory(c: LocalBudgetCategory, userId: string): Partial<SupabaseBudgetCategory> {
  return {
    client_id: c.clientId,
    user_id: userId,
    name: c.name,
    color: c.color,
    monthly_limit: c.monthlyLimit,
    household_id: c.householdId ?? null,
    device_id: c.deviceId ?? null,
    deleted: c.deleted ?? false,
    deleted_at: c.deletedAt ?? null,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
  };
}

function supabaseToLocalBudgetCategory(row: SupabaseBudgetCategory): LocalBudgetCategory {
  return {
    clientId: row.client_id,
    name: row.name,
    color: row.color,
    monthlyLimit: Number(row.monthly_limit),
    householdId: row.household_id ?? undefined,
    deviceId: row.device_id ?? undefined,
    deleted: row.deleted ?? false,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function localToSupabaseBudgetTransaction(t: LocalBudgetTransaction, userId: string): Partial<SupabaseBudgetTransaction> {
  return {
    client_id: t.clientId,
    user_id: userId,
    category_id: t.categoryId,
    amount: t.amount,
    note: t.note ?? null,
    date: t.date,
    household_id: t.householdId ?? null,
    device_id: t.deviceId ?? null,
    deleted: t.deleted ?? false,
    deleted_at: t.deletedAt ?? null,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}

function supabaseToLocalBudgetTransaction(row: SupabaseBudgetTransaction): LocalBudgetTransaction {
  return {
    clientId: row.client_id,
    categoryId: row.category_id,
    amount: Number(row.amount),
    note: row.note ?? undefined,
    date: row.date,
    householdId: row.household_id ?? undefined,
    deviceId: row.device_id ?? undefined,
    deleted: row.deleted ?? false,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── BUDGET CATEGORY OVERRIDES (per-month limit overrides) ───

interface SupabaseBudgetCategoryOverride {
  client_id: string;
  user_id: string;
  category_id: string;
  month_key: string;
  monthly_limit: number;
  device_id: string | null;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function localToSupabaseBudgetCategoryOverride(
  o: LocalBudgetCategoryOverride,
  userId: string,
): Partial<SupabaseBudgetCategoryOverride> {
  return {
    client_id: o.clientId,
    user_id: userId,
    category_id: o.categoryId,
    month_key: o.monthKey,
    monthly_limit: o.monthlyLimit,
    device_id: o.deviceId ?? null,
    deleted: o.deleted ?? false,
    deleted_at: o.deletedAt ?? null,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
  };
}

function supabaseToLocalBudgetCategoryOverride(row: SupabaseBudgetCategoryOverride): LocalBudgetCategoryOverride {
  return {
    clientId: row.client_id,
    categoryId: row.category_id,
    monthKey: row.month_key,
    monthlyLimit: Number(row.monthly_limit),
    deviceId: row.device_id ?? undefined,
    deleted: row.deleted ?? false,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── GOAL (single table, scope-keyed by period) ───

interface SupabaseGoal {
  client_id: string;
  user_id: string;
  title: string;
  scope: "today" | "month" | "year";
  period_key: string;
  completed: boolean;
  completed_at: string | null;
  device_id: string | null;
  deleted: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function localToSupabaseGoal(g: LocalGoal, userId: string): Partial<SupabaseGoal> {
  return {
    client_id: g.clientId,
    user_id: userId,
    title: g.title,
    scope: g.scope,
    period_key: g.periodKey,
    completed: g.completed ?? false,
    completed_at: g.completedAt ?? null,
    device_id: g.deviceId ?? null,
    deleted: g.deleted ?? false,
    deleted_at: g.deletedAt ?? null,
    created_at: g.createdAt,
    updated_at: g.updatedAt,
  };
}

function supabaseToLocalGoal(row: SupabaseGoal): LocalGoal {
  return {
    clientId: row.client_id,
    title: row.title,
    scope: row.scope as GoalScope,
    periodKey: row.period_key,
    completed: row.completed ?? false,
    completedAt: row.completed_at ?? undefined,
    deviceId: row.device_id ?? undefined,
    deleted: row.deleted ?? false,
    deletedAt: row.deleted_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── ITEM OPERATIONS (write through IndexedDB → enqueue → flush) ───

// Items inherit their parent folder's householdId so dropping a note into the
// family folder automatically shares it. Re-resolved on every save so moving
// an item out of a shared folder un-shares it.
async function resolveHouseholdIdFromFolder(folderId: string | undefined): Promise<string | undefined> {
  if (!folderId) return undefined;
  const folder = await db.folders.where("clientId").equals(folderId).first();
  if (!folder || folder.deleted) throw new Error("This folder is no longer available.");
  assertFamilyWritable(folder);
  return folder.householdId;
}

function assertFamilyWritable(row: LocalItem | LocalFolder) {
  if (row.householdId && (!familyUserId || row.familyAccountId !== familyUserId || row.canWrite !== true)) {
    throw new Error("This family content is read-only or unavailable. Refresh Family access before editing.");
  }
}

async function refreshReminderNotification(item: LocalItem, requestPermission: boolean) {
  if (item.type !== "reminder") return;
  try {
    if (item.deleted || item.reminderCompleted || !item.reminderDate || Date.parse(item.reminderDate) <= Date.now()) {
      await cancelReminderNotification(item.clientId);
    } else {
      await scheduleReminderNotification(item.clientId, item.title, item.content.substring(0, 100),
        new Date(item.reminderDate), requestPermission);
    }
  } catch (error) { console.warn("Device reminder could not be scheduled", error); }
}

export async function createItem(
  item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">
): Promise<LocalItem> {
  const now = new Date().toISOString();
  const clientId = uuidv4();
  const deviceId = getDeviceId();
  const householdId = await resolveHouseholdIdFromFolder(item.folderId);
  if (item.householdId && item.householdId !== householdId) throw new Error("Choose an accessible family folder.");
  if (householdId && !["note", "url", "reminder"].includes(item.type)) throw new Error("Only notes, links and reminders can be shared here.");

  const localItem: LocalItem = {
    ...item,
    clientId,
    deviceId,
    householdId,
    ownerUserId: currentUserId ?? undefined,
    familyAccountId: householdId ? familyUserId ?? undefined : undefined,
    canWrite: true,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  saveDeviceNameMapping(deviceId, getDeviceName());
  await db.items.add(localItem);

  await db.syncQueue.add({
    action: "create",
    entityType: "item",
    clientId,
    data: localItem as unknown as Record<string, unknown>,
    timestamp: now,
  });

  void refreshReminderNotification(localItem, true);

  triggerSync();
  return localItem;
}

export async function updateItem(
  clientId: string,
  updates: Partial<LocalItem>
): Promise<LocalItem | undefined> {
  const now = new Date().toISOString();
  const item = await db.items.where("clientId").equals(clientId).first();
  if (!item) throw new Error("This note is no longer available. Keep your draft and refresh Family access.");
  assertFamilyWritable(item);

  // If the folder changed (or this is the first save and householdId wasn't
  // set explicitly), re-resolve the householdId from the destination folder.
  // Moving a private note into an accessible family folder shares it.
  // Moving existing shared notes is intentionally unavailable in this increment.
  let householdIdPatch: { householdId?: string } = {};
  if (Object.prototype.hasOwnProperty.call(updates, "folderId") && updates.folderId !== item.folderId) {
    householdIdPatch = { householdId: await resolveHouseholdIdFromFolder(updates.folderId) };
  }

  if (item.householdId && Object.prototype.hasOwnProperty.call(updates, "folderId") && updates.folderId !== item.folderId) {
    throw new Error("Shared items cannot be moved in this version. Copy your own content to a new note instead.");
  }
  const updatedData = { ...updates, householdId: item.householdId, ...householdIdPatch, ownerUserId: item.ownerUserId ?? currentUserId ?? undefined,
    canWrite: item.canWrite, familyAccountId: item.familyAccountId, updatedAt: now };
  if (updatedData.householdId && !["note", "url", "reminder"].includes(updates.type ?? item.type)) throw new Error("Only notes, links and reminders can be shared here.");
  if (updatedData.householdId && !item.householdId) {
    updatedData.familyAccountId = familyUserId ?? undefined;
    updatedData.canWrite = true;
  }
  await db.items.where("clientId").equals(clientId).modify((i) => {
    Object.assign(i, updatedData);
  });

  await db.syncQueue.add({
    action: "update",
    entityType: "item",
    clientId,
    data: updatedData as unknown as Record<string, unknown>,
    timestamp: now,
  });

  void refreshReminderNotification({ ...item, ...updatedData }, true);
  triggerSync();
  return { ...item, ...updatedData };
}

export async function deleteItem(clientId: string): Promise<void> {
  const now = new Date().toISOString();
  const item = await db.items.where("clientId").equals(clientId).first();
  if (!item) return;
  assertFamilyWritable(item);

  await db.items.where("clientId").equals(clientId).modify((i) => {
    i.deleted = true;
    i.deletedAt = now;
    i.updatedAt = now;
  });

  await db.syncQueue.add({
    action: "delete",
    entityType: "item",
    clientId,
    timestamp: now,
  });

  cancelReminderNotification(clientId);
  triggerSync();
}

export async function getItems(
  type?: string,
  searchQuery?: string,
  folderId?: string | null
): Promise<LocalItem[]> {
  let items: LocalItem[];

  if (type && type !== "all") {
    items = await db.items.where("type").equals(type).toArray();
  } else {
    items = await db.items.toArray();
  }

  items = items.filter((item) => (!item.householdId || item.familyAccountId === familyUserId) && !item.deleted && item.type !== "envvar" && item.type !== "credential");

  if (folderId) {
    items = items.filter((item) => item.folderId === folderId);
  }

  if (searchQuery) {
    const terms = searchQuery.toLowerCase().split(/\s+/);
    items = items.filter((item) => {
      const searchable = `${item.title} ${item.content} ${item.tags.join(" ")} ${item.url || ""}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }

  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return items;
}

// ─── TRASH ───

export async function getDeletedItems(): Promise<LocalItem[]> {
  const items = await db.items.toArray();
  return items
    .filter((item) => (!item.householdId || item.familyAccountId === familyUserId) && item.deleted && item.type !== "envvar" && item.type !== "credential")
    .sort((a, b) => {
      const aTime = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const bTime = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return bTime - aTime;
    });
}

export async function restoreItem(clientId: string): Promise<void> {
  const now = new Date().toISOString();
  const item = await db.items.where("clientId").equals(clientId).first();
  if (!item) return;
  assertFamilyWritable(item);

  await db.items.where("clientId").equals(clientId).modify((i) => {
    i.deleted = false;
    i.deletedAt = undefined;
    i.updatedAt = now;
  });

  await db.syncQueue.add({
    action: "update",
    entityType: "item",
    clientId,
    data: { deleted: false, deletedAt: null, updatedAt: now },
    timestamp: now,
  });

  triggerSync();
}

export async function permanentlyDeleteItem(clientId: string): Promise<void> {
  const item = await db.items.where("clientId").equals(clientId).first();
  if (!item) return;
  if (item.householdId) {
    assertFamilyWritable(item);
    if (!item.deleted) throw new Error("Move this shared item to trash first.");
    if (!navigator.onLine) throw new Error("Connect to permanently delete a shared item for everyone.");
    const generation = syncGeneration;
    const userId = await getCurrentUserId();
    if (!userId || generation !== syncGeneration) throw new Error("Sign in again before deleting shared content.");
    await getSupabaseBrowserClient().from("items").delete().eq("client_id", clientId)
      .select("client_id").single().throwOnError();
    if (generation !== syncGeneration) return;
    await db.transaction("rw", db.items, db.syncQueue, async () => {
      await db.items.where("clientId").equals(clientId).delete();
      await db.syncQueue.where("clientId").equals(clientId).delete();
    });
    return;
  }
  await db.items.where("clientId").equals(clientId).delete();
}

export async function purgeOldTrash(): Promise<void> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const items = await db.items.toArray();
  const toPurge = items.filter(
    (item) =>
      item.deleted &&
      item.deletedAt &&
      new Date(item.deletedAt) < thirtyDaysAgo
  );

  for (const item of toPurge) {
    // Never discard the only payload of a pending offline deletion.
    if (await db.syncQueue.where("clientId").equals(item.clientId).count()) continue;
    await db.items.where("clientId").equals(item.clientId).delete();
  }
}

// ─── FOLDER OPERATIONS ───

export async function createFolder(
  folder: Omit<LocalFolder, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">
): Promise<LocalFolder> {
  const now = new Date().toISOString();
  const clientId = uuidv4();

  if (folder.householdId) throw new Error("Create the default shared folder from Family settings.");

  const localFolder: LocalFolder = {
    ...folder,
    clientId,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.folders.add(localFolder);

  await db.syncQueue.add({
    action: "create",
    entityType: "folder",
    clientId,
    data: localFolder as unknown as Record<string, unknown>,
    timestamp: now,
  });

  triggerSync();
  return localFolder;
}

export async function updateFolder(
  clientId: string,
  updates: Partial<LocalFolder>
): Promise<LocalFolder | undefined> {
  const now = new Date().toISOString();
  const folder = await db.folders.where("clientId").equals(clientId).first();
  if (!folder) return undefined;
  assertFamilyWritable(folder);
  if (folder.householdId && folder.ownerUserId !== familyUserId) throw new Error("Only the folder creator can change this folder.");
  if (updates.householdId !== undefined && updates.householdId !== folder.householdId) throw new Error("Create a family from Family settings instead.");

  const updatedData = { ...updates, updatedAt: now };
  await db.folders.where("clientId").equals(clientId).modify((f) => {
    Object.assign(f, updatedData);
  });

  await db.syncQueue.add({
    action: "update",
    entityType: "folder",
    clientId,
    data: updatedData as unknown as Record<string, unknown>,
    timestamp: now,
  });

  triggerSync();
  return { ...folder, ...updatedData };
}

export async function deleteFolder(clientId: string): Promise<void> {
  const now = new Date().toISOString();
  const folder = await db.folders.where("clientId").equals(clientId).first();
  if (!folder) return;
  assertFamilyWritable(folder);
  if (folder.householdId) throw new Error("Shared folders are managed in Family settings. Delete the family there instead.");

  await db.folders.where("clientId").equals(clientId).modify((f) => {
    f.deleted = true;
    f.updatedAt = now;
  });

  const folderItems = await db.items.where("folderId").equals(clientId).toArray();
  for (const item of folderItems) {
    if (!item.deleted) {
      await db.items.where("clientId").equals(item.clientId).modify((i) => {
        i.deleted = true;
        i.updatedAt = now;
      });

      await db.syncQueue.add({
        action: "delete",
        entityType: "item",
        clientId: item.clientId,
        timestamp: now,
      });
    }
  }

  await db.syncQueue.add({
    action: "delete",
    entityType: "folder",
    clientId,
    timestamp: now,
  });

  triggerSync();
}

export async function getFolders(): Promise<LocalFolder[]> {
  const folders = await db.folders.toArray();
  return folders.filter((f) => !f.deleted && (!f.householdId || f.familyAccountId === familyUserId)).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── LOCATION OPERATIONS ───

export async function createLocation(
  loc: Omit<LocalLocation, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">
): Promise<LocalLocation> {
  const now = new Date().toISOString();
  const clientId = uuidv4();
  const deviceId = getDeviceId();

  const localLocation: LocalLocation = {
    ...loc,
    clientId,
    deviceId,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  saveDeviceNameMapping(deviceId, getDeviceName());
  await db.locations.add(localLocation);

  await db.syncQueue.add({
    action: "create",
    entityType: "location",
    clientId,
    data: localLocation as unknown as Record<string, unknown>,
    timestamp: now,
  });

  triggerSync();
  return localLocation;
}

export async function updateLocation(
  clientId: string,
  updates: Partial<LocalLocation>
): Promise<LocalLocation | undefined> {
  const now = new Date().toISOString();
  const loc = await db.locations.where("clientId").equals(clientId).first();
  if (!loc) return undefined;

  const updatedData = { ...updates, updatedAt: now };
  await db.locations.where("clientId").equals(clientId).modify((l) => {
    Object.assign(l, updatedData);
  });

  await db.syncQueue.add({
    action: "update",
    entityType: "location",
    clientId,
    data: updatedData as unknown as Record<string, unknown>,
    timestamp: now,
  });

  triggerSync();
  return { ...loc, ...updatedData };
}

export async function deleteLocation(clientId: string): Promise<void> {
  const now = new Date().toISOString();

  await db.locations.where("clientId").equals(clientId).modify((l) => {
    l.deleted = true;
    l.deletedAt = now;
    l.updatedAt = now;
  });

  await db.syncQueue.add({
    action: "delete",
    entityType: "location",
    clientId,
    timestamp: now,
  });

  triggerSync();
}

export async function getLocations(searchQuery?: string): Promise<LocalLocation[]> {
  let locations = await db.locations.toArray();
  locations = locations.filter((l) => !l.deleted);

  if (searchQuery) {
    const terms = searchQuery.toLowerCase().split(/\s+/);
    locations = locations.filter((l) => {
      const searchable = `${l.name} ${l.address ?? ""} ${l.notes ?? ""} ${l.tags.join(" ")}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }

  locations.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return locations;
}

// ─── BUDGET OPERATIONS ───

export async function createBudgetCategory(
  input: { name: string; color: string; monthlyLimit: number; householdId?: string } & { clientId?: string; createdAt?: string },
): Promise<LocalBudgetCategory> {
  const now = new Date().toISOString();
  const clientId = input.clientId ?? uuidv4();
  const deviceId = getDeviceId();

  const local: LocalBudgetCategory = {
    clientId,
    name: input.name,
    color: input.color,
    monthlyLimit: input.monthlyLimit,
    householdId: input.householdId,
    deviceId,
    deleted: false,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };

  saveDeviceNameMapping(deviceId, getDeviceName());
  await db.budgetCategories.add(local);

  await db.syncQueue.add({
    action: "create",
    entityType: "budget_category",
    clientId,
    data: local as unknown as Record<string, unknown>,
    timestamp: now,
  });

  triggerSync();
  return local;
}

export async function deleteBudgetCategory(clientId: string): Promise<void> {
  const now = new Date().toISOString();

  await db.budgetCategories.where("clientId").equals(clientId).modify((c) => {
    c.deleted = true;
    c.deletedAt = now;
    c.updatedAt = now;
  });
  // Also tombstone every transaction for that category so the running totals
  // don't include orphan rows on other devices.
  await db.budgetTransactions.where("categoryId").equals(clientId).modify((t) => {
    t.deleted = true;
    t.deletedAt = now;
    t.updatedAt = now;
  });

  await db.syncQueue.add({
    action: "delete",
    entityType: "budget_category",
    clientId,
    timestamp: now,
  });

  triggerSync();
}

export async function createBudgetTransaction(
  input: { categoryId: string; amount: number; note?: string; date: string } & { clientId?: string },
): Promise<LocalBudgetTransaction> {
  const now = new Date().toISOString();
  const clientId = input.clientId ?? uuidv4();
  const deviceId = getDeviceId();

  // Transactions inherit their parent category's householdId — if you spend
  // against a family-shared category, the transaction is shared too.
  const parentCat = await db.budgetCategories.where("clientId").equals(input.categoryId).first();

  const local: LocalBudgetTransaction = {
    clientId,
    categoryId: input.categoryId,
    amount: input.amount,
    note: input.note,
    date: input.date,
    householdId: parentCat?.householdId,
    deviceId,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  saveDeviceNameMapping(deviceId, getDeviceName());
  await db.budgetTransactions.add(local);

  await db.syncQueue.add({
    action: "create",
    entityType: "budget_transaction",
    clientId,
    data: local as unknown as Record<string, unknown>,
    timestamp: now,
  });

  triggerSync();
  return local;
}

export async function deleteBudgetTransaction(clientId: string): Promise<void> {
  const now = new Date().toISOString();

  await db.budgetTransactions.where("clientId").equals(clientId).modify((t) => {
    t.deleted = true;
    t.deletedAt = now;
    t.updatedAt = now;
  });

  await db.syncQueue.add({
    action: "delete",
    entityType: "budget_transaction",
    clientId,
    timestamp: now,
  });

  triggerSync();
}

// Must match use-budget.ts so reads + writes hit the same key.
const MONTHLY_INCOME_KEY = "noticomax_budget_monthly_income";
const MONTHLY_INCOME_QUEUE_CLIENT_ID = "monthly_income";

export function getMonthlyIncomeLocal(): number {
  if (typeof window === "undefined") return 0;
  const v = localStorage.getItem(MONTHLY_INCOME_KEY);
  if (!v) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

export async function setMonthlyIncome(amount: number): Promise<void> {
  if (typeof window !== "undefined") {
    localStorage.setItem(MONTHLY_INCOME_KEY, String(amount));
  }
  const now = new Date().toISOString();
  // The settings row is a singleton per user — use a fixed clientId so the
  // sync queue deduplicates writes from the same device.
  await db.syncQueue.add({
    action: "update",
    entityType: "budget_settings",
    clientId: MONTHLY_INCOME_QUEUE_CLIENT_ID,
    data: { monthly_income: amount, updated_at: now },
    timestamp: now,
  });
  triggerSync();
}

// Set the per-month limit override for a category. Upserts by
// (categoryId, monthKey); passing null/undefined for `amount` tombstones
// any existing override so the category falls back to its default limit.
export async function setBudgetCategoryOverride(
  categoryId: string,
  monthKey: string,
  amount: number | null,
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await db.budgetCategoryOverrides
    .where("[categoryId+monthKey]")
    .equals([categoryId, monthKey])
    .first();

  if (amount == null || amount === 0) {
    // Clear: tombstone if it exists, otherwise nothing to do.
    if (!existing || existing.deleted) return;
    await db.budgetCategoryOverrides
      .where("clientId").equals(existing.clientId)
      .modify((o) => {
        o.deleted = true;
        o.deletedAt = now;
        o.updatedAt = now;
      });
    await db.syncQueue.add({
      action: "delete",
      entityType: "budget_category_override",
      clientId: existing.clientId,
      timestamp: now,
    });
    triggerSync();
    return;
  }

  const deviceId = getDeviceId();
  saveDeviceNameMapping(deviceId, getDeviceName());

  if (existing) {
    await db.budgetCategoryOverrides
      .where("clientId").equals(existing.clientId)
      .modify((o) => {
        o.monthlyLimit = amount;
        o.deleted = false;
        o.deletedAt = undefined;
        o.deviceId = deviceId;
        o.updatedAt = now;
      });
    await db.syncQueue.add({
      action: "update",
      entityType: "budget_category_override",
      clientId: existing.clientId,
      data: { monthly_limit: amount, deleted: false, updated_at: now },
      timestamp: now,
    });
  } else {
    const local: LocalBudgetCategoryOverride = {
      clientId: uuidv4(),
      categoryId,
      monthKey,
      monthlyLimit: amount,
      deviceId,
      deleted: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.budgetCategoryOverrides.add(local);
    await db.syncQueue.add({
      action: "create",
      entityType: "budget_category_override",
      clientId: local.clientId,
      data: local as unknown as Record<string, unknown>,
      timestamp: now,
    });
  }
  triggerSync();
}

// ─── GOAL OPERATIONS ───

export async function createGoal(
  input: { title: string; scope: GoalScope; periodKey: string } & { clientId?: string; createdAt?: string; completed?: boolean; completedAt?: string },
): Promise<LocalGoal> {
  const now = new Date().toISOString();
  const clientId = input.clientId ?? uuidv4();
  const deviceId = getDeviceId();

  const local: LocalGoal = {
    clientId,
    title: input.title,
    scope: input.scope,
    periodKey: input.periodKey,
    completed: input.completed ?? false,
    completedAt: input.completedAt,
    deviceId,
    deleted: false,
    createdAt: input.createdAt ?? now,
    updatedAt: now,
  };

  saveDeviceNameMapping(deviceId, getDeviceName());
  await db.goals.add(local);

  await db.syncQueue.add({
    action: "create",
    entityType: "goal",
    clientId,
    data: local as unknown as Record<string, unknown>,
    timestamp: now,
  });

  triggerSync();
  return local;
}

export async function toggleGoal(clientId: string, currentlyCompleted: boolean): Promise<void> {
  const now = new Date().toISOString();
  const nextCompleted = !currentlyCompleted;
  const nextCompletedAt = nextCompleted ? now : undefined;

  await db.goals.where("clientId").equals(clientId).modify((g) => {
    g.completed = nextCompleted;
    g.completedAt = nextCompletedAt;
    g.updatedAt = now;
  });

  await db.syncQueue.add({
    action: "update",
    entityType: "goal",
    clientId,
    data: {
      completed: nextCompleted,
      completed_at: nextCompletedAt ?? null,
      updated_at: now,
    },
    timestamp: now,
  });

  triggerSync();
}

export async function deleteGoal(clientId: string): Promise<void> {
  const now = new Date().toISOString();

  await db.goals.where("clientId").equals(clientId).modify((g) => {
    g.deleted = true;
    g.deletedAt = now;
    g.updatedAt = now;
  });

  await db.syncQueue.add({
    action: "delete",
    entityType: "goal",
    clientId,
    timestamp: now,
  });

  triggerSync();
}

// ─── SYNC TO SUPABASE ───

let syncInProgress = false;

/** A complete RLS snapshot is required before any Family write or cache eviction.
 * The RPC uses one database snapshot and fails rather than truncating large families.
 */
async function pullFamilyChanges(userId: string, generation: number): Promise<void> {
  const { data, error } = await getSupabaseBrowserClient().rpc("family_content_snapshot");
  if (error) throw error;
  if (!data || data.user_id !== userId || !Array.isArray(data.folders) || !Array.isArray(data.items)) {
    throw new Error("Incomplete Family sync response. Local changes were kept.");
  }
  if (generation !== syncGeneration) throw new Error("Account changed during sync.");
  const folders = (data.folders as (SupabaseFolder & { can_write: boolean })[]).map((row) => ({
    ...supabaseToLocalFolder(row), canWrite: row.can_write,
  }));
  const items = (data.items as (SupabaseItem & { can_write: boolean })[]).map((row) => ({
    ...supabaseToLocalItem(row), canWrite: row.can_write,
  }));
  const visibleFolders = new Map(folders.map((row) => [row.clientId, row]));
  const visibleItems = new Set(items.map((row) => row.clientId));
  const removedReminders: string[] = [];
  const changedReminders: LocalItem[] = [];
  await db.transaction("rw", db.items, db.folders, db.syncQueue, async () => {
    if (generation !== syncGeneration) throw new Error("Account changed during sync.");
    const pending = await db.syncQueue.toArray();
    const pendingIds = new Set(pending.map((op) => op.clientId));
    // Revoked access removes cached shared content and its outgoing operations.
    // Never remove personal rows; never run this on failed/partial responses.
    for (const local of await db.items.toArray()) {
      if (!local.householdId || visibleItems.has(local.clientId)) continue;
      const folder = local.folderId ? visibleFolders.get(local.folderId) : undefined;
      const newDraft = local.ownerUserId === userId && local.familyAccountId === userId
        && folder && !folder.deleted && pending.some((op) => op.clientId === local.clientId && (op.action === "create" || !!op.data?.householdId));
      if (newDraft) {
        await db.items.where("clientId").equals(local.clientId).modify((row) => { row.canWrite = folder.canWrite; });
        continue;
      }
      await db.items.where("clientId").equals(local.clientId).delete();
      await db.syncQueue.where("clientId").equals(local.clientId).delete();
      removedReminders.push(local.clientId);
    }
    for (const local of await db.folders.toArray()) {
      if (!local.householdId || visibleFolders.has(local.clientId)) continue;
      await db.folders.where("clientId").equals(local.clientId).delete();
      await db.syncQueue.where("clientId").equals(local.clientId).delete();
    }
    for (const row of folders) {
      const local = await db.folders.where("clientId").equals(row.clientId).first();
      if (!local) await db.folders.add(row);
      else await db.folders.update(local.id!, pendingIds.has(row.clientId)
        ? { ownerUserId: row.ownerUserId, familyAccountId: userId, serverId: row.serverId, canWrite: row.canWrite } : row);
    }
    for (const row of items) {
      const local = await db.items.where("clientId").equals(row.clientId).first();
      if (!pendingIds.has(row.clientId) && row.type === "reminder" && (!local || local.updatedAt !== row.updatedAt)) changedReminders.push(row);
      if (!local) await db.items.add(row);
      else await db.items.update(local.id!, pendingIds.has(row.clientId)
        ? { ownerUserId: row.ownerUserId, familyAccountId: userId, serverId: row.serverId, canWrite: row.canWrite } : row);
    }
  });
  for (const id of removedReminders) void cancelReminderNotification(id).catch(() => {});
  if (generation === syncGeneration) for (const row of changedReminders) void refreshReminderNotification(row, false);
}

export async function performSync(): Promise<boolean> {
  if ((!syncEnabled && !familyUserId) || syncInProgress || !navigator.onLine) return false;
  syncInProgress = true;
  const generation = syncGeneration;
  const errors: string[] = [];
  try {
    const userId = await getCurrentUserId();
    if (!userId || generation !== syncGeneration) return false;
    const supabase = getSupabaseBrowserClient();
    if (familyUserId) await pullFamilyChanges(userId, generation);
    const queue = await db.syncQueue.orderBy("timestamp").toArray();
    const latest = new Map<string, (typeof queue)[0]>();
    for (const op of queue) latest.set(`${op.entityType}:${op.clientId}`, op);
    // Parent rows before their children. Acknowledgments refer only to this snapshot.
    const order = ["folder", "item", "location", "budget_category", "budget_transaction", "budget_category_override", "budget_settings", "goal"];
    const operations = [...latest.values()].sort((a, b) => order.indexOf(a.entityType) - order.indexOf(b.entityType));
    for (const op of operations) {
      if (generation !== syncGeneration) return false;
      try {
        if (op.entityType === "budget_settings") {
          if (!syncEnabled) continue;
          const income = op.data?.monthly_income;
          if (typeof income !== "number") throw new Error("Invalid budget sync entry.");
          await supabase.from("budget_settings").upsert({ user_id: userId, monthly_income: income,
            updated_at: op.data?.updated_at ?? op.timestamp }, { onConflict: "user_id" }).throwOnError();
        } else {
          let table: string;
          let payload: Record<string, unknown>;
          let familyRow: LocalItem | LocalFolder | undefined;
          switch (op.entityType) {
            case "folder": {
              const row = await db.folders.where("clientId").equals(op.clientId).first();
              if (!row) continue;
              familyRow = row; table = "folders"; payload = localToSupabaseFolder(row, userId); break;
            }
            case "item": {
              const row = await db.items.where("clientId").equals(op.clientId).first();
              if (!row) continue;
              familyRow = row; table = "items"; payload = localToSupabaseItem(row, userId); break;
            }
            case "location": {
              if (!syncEnabled) continue;
              const row = await db.locations.where("clientId").equals(op.clientId).first();
              if (!row) continue;
              table = "locations"; payload = localToSupabaseLocation(row, userId); break;
            }
            case "budget_category": {
              if (!syncEnabled) continue;
              const row = await db.budgetCategories.where("clientId").equals(op.clientId).first();
              if (!row) continue;
              table = "budget_categories"; payload = localToSupabaseBudgetCategory(row, userId); break;
            }
            case "budget_transaction": {
              if (!syncEnabled) continue;
              const row = await db.budgetTransactions.where("clientId").equals(op.clientId).first();
              if (!row) continue;
              table = "budget_transactions"; payload = localToSupabaseBudgetTransaction(row, userId); break;
            }
            case "budget_category_override": {
              if (!syncEnabled) continue;
              const row = await db.budgetCategoryOverrides.where("clientId").equals(op.clientId).first();
              if (!row) continue;
              table = "budget_category_overrides"; payload = localToSupabaseBudgetCategoryOverride(row, userId); break;
            }
            case "goal": {
              if (!syncEnabled) continue;
              const row = await db.goals.where("clientId").equals(op.clientId).first();
              if (!row) continue;
              table = "goals"; payload = localToSupabaseGoal(row, userId); break;
            }
            default: continue;
          }
          if (familyRow?.householdId) {
            assertFamilyWritable(familyRow);
            if (op.entityType === "item" && !["note", "url", "reminder"].includes(String(payload.type))) continue;
          } else if (!syncEnabled) continue;
          if (generation !== syncGeneration) return false;
          // Upserting another member's existing row fails INSERT RLS and must
          // never replace user_id. UPDATE preserves the original creator.
          if (familyRow?.serverId || (op.action === "delete" && !familyRow)) {
            const { client_id: _id, user_id: _owner, ...updates } = payload;
            void _id; void _owner;
            await supabase.from(table).update(updates).eq("client_id", op.clientId)
              .select("client_id").single().throwOnError();
          } else {
            await supabase.from(table).upsert(payload, { onConflict: "client_id" })
              .select("client_id").single().throwOnError();
          }
          if (op.entityType === "budget_category" && op.action === "delete") {
            await supabase.from("budget_transactions").update({ deleted: true, deleted_at: op.timestamp,
              updated_at: op.timestamp }).eq("category_id", op.clientId).throwOnError();
          }
        }
        if (generation !== syncGeneration) return false;
        const ids = queue.filter((entry) => entry.entityType === op.entityType && entry.clientId === op.clientId)
          .flatMap((entry) => entry.id === undefined ? [] : [entry.id]);
        await db.syncQueue.bulkDelete(ids);
      } catch (error) {
        // Keep this operation and any concurrent/newer writes for a later retry.
        errors.push(error instanceof Error ? error.message : "A change could not be synced. Your pending edit is kept on this device.");
      }
    }
    if (generation !== syncGeneration) return false;
    if (syncEnabled) await pullChanges(userId, generation);
    if (familyUserId) await pullFamilyChanges(userId, generation);
    notifySyncComplete();
    if (errors.length) throw new Error(errors[0]);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync is unavailable. Your changes were kept on this device.";
    console.error("Sync error:", message);
    if (generation === syncGeneration && onSyncError) onSyncError(message);
    return false;
  } finally { syncInProgress = false; }
}

async function pullChanges(userId: string, generation: number): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const assertCurrent = () => { if (generation !== syncGeneration) throw new Error("Account changed during sync."); };
  // Personal data is paged separately and never enables a free household user's
  // private cloud sync. No eviction uses these pages; only the atomic Family RPC
  // can revoke shared cache entries.
  const readRows = async (table: string, privateOnly = false, ownerOnly = false) => {
    const rows: Record<string, unknown>[] = [];
    let after: string | undefined;
    for (;;) {
      let query = supabase.from(table).select("*").order("client_id").limit(250);
      if (privateOnly) query = query.is("household_id", null);
      if (ownerOnly) query = query.eq("user_id", userId);
      if (after) query = query.gt("client_id", after);
      const { data } = await query.throwOnError();
      assertCurrent();
      if (!data?.length) break;
      rows.push(...data);
      after = String(data[data.length - 1].client_id);
    }
    return rows;
  };

  // Shared notes and folders are reconciled only by the Family snapshot.
  const items = await readRows("items", true, true);

  if (items) {
    for (const row of items as unknown as SupabaseItem[]) {
      const mapped = supabaseToLocalItem(row);
      const existing = await db.items.where("clientId").equals(mapped.clientId).first();
      assertCurrent();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          assertCurrent();
          await db.items.where("clientId").equals(mapped.clientId).modify((i) => {
            Object.assign(i, mapped);
          });
        }
      } else {
        assertCurrent();
        await db.items.add(mapped);
      }
    }
  }

  const folders = await readRows("folders", true, true);

  if (folders) {
    for (const row of folders as unknown as SupabaseFolder[]) {
      const mapped = supabaseToLocalFolder(row);
      const existing = await db.folders.where("clientId").equals(mapped.clientId).first();
      assertCurrent();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          assertCurrent();
          await db.folders.where("clientId").equals(mapped.clientId).modify((f) => {
            Object.assign(f, mapped);
          });
        }
      } else {
        assertCurrent();
        await db.folders.add(mapped);
      }
    }
  }

  const locations = await readRows("locations");

  if (locations) {
    for (const row of locations as unknown as SupabaseLocation[]) {
      const mapped = supabaseToLocalLocation(row);
      const existing = await db.locations.where("clientId").equals(mapped.clientId).first();
      assertCurrent();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          assertCurrent();
          await db.locations.where("clientId").equals(mapped.clientId).modify((l) => {
            Object.assign(l, mapped);
          });
        }
      } else {
        assertCurrent();
        await db.locations.add(mapped);
      }
    }
  }

  const budgetCats = await readRows("budget_categories");
  if (budgetCats) {
    for (const row of budgetCats as unknown as SupabaseBudgetCategory[]) {
      const mapped = supabaseToLocalBudgetCategory(row);
      const existing = await db.budgetCategories.where("clientId").equals(mapped.clientId).first();
      assertCurrent();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          assertCurrent();
          await db.budgetCategories.where("clientId").equals(mapped.clientId).modify((c) => {
            Object.assign(c, mapped);
          });
        }
      } else {
        assertCurrent();
        await db.budgetCategories.add(mapped);
      }
    }
  }

  const budgetTxns = await readRows("budget_transactions");
  if (budgetTxns) {
    for (const row of budgetTxns as unknown as SupabaseBudgetTransaction[]) {
      const mapped = supabaseToLocalBudgetTransaction(row);
      const existing = await db.budgetTransactions.where("clientId").equals(mapped.clientId).first();
      assertCurrent();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          assertCurrent();
          await db.budgetTransactions.where("clientId").equals(mapped.clientId).modify((t) => {
            Object.assign(t, mapped);
          });
        }
      } else {
        assertCurrent();
        await db.budgetTransactions.add(mapped);
      }
    }
  }

  const budgetOverrides = await readRows("budget_category_overrides");
  if (budgetOverrides) {
    for (const row of budgetOverrides as unknown as SupabaseBudgetCategoryOverride[]) {
      const mapped = supabaseToLocalBudgetCategoryOverride(row);
      const existing = await db.budgetCategoryOverrides.where("clientId").equals(mapped.clientId).first();
      assertCurrent();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          assertCurrent();
          await db.budgetCategoryOverrides.where("clientId").equals(mapped.clientId).modify((o) => {
            Object.assign(o, mapped);
          });
        }
      } else {
        assertCurrent();
        await db.budgetCategoryOverrides.add(mapped);
      }
    }
  }

  // Settings is a singleton — always pull the latest and write to localStorage so
  // useBudget picks it up on next render.
  const { data: settings } = await supabase
    .from("budget_settings")
    .select("monthly_income, updated_at")
    .eq("user_id", userId)
    .maybeSingle().throwOnError();
  assertCurrent();
  if (settings && typeof window !== "undefined") {
    const pending = await db.syncQueue
      .where("entityType")
      .equals("budget_settings")
      .count();
    if (pending === 0) {
      localStorage.setItem(MONTHLY_INCOME_KEY, String(Number(settings.monthly_income) || 0));
    }
  }

  const goals = await readRows("goals", false, true);
  if (goals) {
    for (const row of goals as unknown as SupabaseGoal[]) {
      const mapped = supabaseToLocalGoal(row);
      const existing = await db.goals.where("clientId").equals(mapped.clientId).first();
      assertCurrent();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          assertCurrent();
          await db.goals.where("clientId").equals(mapped.clientId).modify((g) => {
            Object.assign(g, mapped);
          });
        }
      } else {
        assertCurrent();
        await db.goals.add(mapped);
      }
    }
  }
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function triggerSync() {
  if (!syncEnabled && !familyUserId) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    performSync();
  }, 1000);
}

export async function initialSync(): Promise<void> {
  if (typeof window !== "undefined") localStorage.removeItem(SYNC_KEY);
  await performSync();
}

// ─── REALTIME ───

let realtimeChannel: RealtimeChannel | null = null;

function teardownRealtime() {
  if (realtimeChannel) {
    const supabase = getSupabaseBrowserClient();
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
}

async function setupRealtime() {
  teardownRealtime();
  const generation = syncGeneration;
  const userId = await getCurrentUserId();
  if (!userId || generation !== syncGeneration) return;
  const supabase = getSupabaseBrowserClient();
  let channel = supabase.channel(`library-${userId}`);
  for (const table of ["items", "folders", "household_members", "folder_member_permissions",
    ...(syncEnabled ? ["locations", "budget_categories", "budget_transactions", "budget_category_overrides", "budget_settings", "goals"] : [])]) {
    channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, () => triggerSync());
  }
  realtimeChannel = channel.subscribe();
}

const syncSubscribers = new Set<() => void>();
export function subscribeSyncComplete(callback: () => void) {
  syncSubscribers.add(callback);
  return () => { syncSubscribers.delete(callback); };
}
function notifySyncComplete() {
  onSyncComplete?.();
  for (const callback of syncSubscribers) callback();
}

let onSyncComplete: (() => void) | null = null;
let onSyncError: ((error: string) => void) | null = null;

export function setOnSyncComplete(callback: (() => void) | null): (() => void) | null {
  const prev = onSyncComplete;
  onSyncComplete = callback;
  return prev;
}

export function setOnSyncError(callback: ((error: string) => void) | null) {
  onSyncError = callback;
}

export function setupSyncListeners(): () => void {
  if (typeof window === "undefined") return () => {};

  const onOnline = async () => {
    const didSync = await performSync();
    if (didSync) notifySyncComplete();
  };

  window.addEventListener("online", onOnline);

  // Realtime supersedes polling — but pull on visibility change in case realtime
  // dropped a message while the tab was hidden.
  const onVisibilityChange = async () => {
    if (document.visibilityState === "visible" && (syncEnabled || familyUserId) && navigator.onLine) {
      const didSync = await performSync();
      if (didSync) notifySyncComplete();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  let unsubscribeAuth: (() => void) | undefined;
  try {
    const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "SIGNED_OUT" || (familyUserId && session?.user.id && session.user.id !== familyUserId)) {
        // Do not fetch inside Supabase's auth callback. Disable old-user writes
        // immediately; the license hook enables the new context after its wipe.
        syncGeneration++;
        syncEnabled = false;
        familyUserId = null;
        currentUserId = null;
        window.setTimeout(() => { teardownRealtime(); void clearFamilyCache().then(notifySyncComplete); }, 0);
      }
    });
    unsubscribeAuth = () => data.subscription.unsubscribe();
  } catch { /* Not configured; the auth screen handles it. */ }

  // Spin up realtime if we're already enabled
  if (syncEnabled || familyUserId) void setupRealtime().catch(() => { /* Polling retries after reconnect. */ });
  // Membership revocations may not emit readable realtime events to the removed member.
  const interval = window.setInterval(() => {
    if (document.visibilityState === "visible") void performSync();
  }, 30_000);

  return () => {
    unsubscribeAuth?.();
    window.clearInterval(interval);
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    teardownRealtime();
  };
}

// ─── ENVIRONMENT VARIABLES ───

export interface EnvVar {
  clientId: string;
  name: string;
  value: string;
  project: string;
}

const DEFAULT_ENV_PROJECT = "Default";

export async function getEnvVars(): Promise<EnvVar[]> {
  const items = await db.items.where("type").equals("envvar").toArray();
  return items
    .filter((item) => !item.deleted)
    .map((item) => ({
      clientId: item.clientId,
      name: item.title,
      value: item.content,
      project: item.tags[0] || DEFAULT_ENV_PROJECT,
    }));
}

export async function addEnvVar(name: string, value: string, project: string, syncFlag: boolean): Promise<void> {
  const now = new Date().toISOString();
  const clientId = uuidv4();
  const projectName = project.trim() || DEFAULT_ENV_PROJECT;

  const localItem: LocalItem = {
    clientId,
    type: "envvar",
    title: name,
    content: value,
    tags: [projectName],
    pinned: false,
    deviceId: getDeviceId(),
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.items.add(localItem);

  if (syncFlag && syncEnabled) {
    await db.syncQueue.add({
      action: "create",
      entityType: "item",
      clientId,
      data: localItem as unknown as Record<string, unknown>,
      timestamp: now,
    });
    triggerSync();
  }
}

export async function removeEnvVar(clientId: string, syncFlag: boolean): Promise<void> {
  const now = new Date().toISOString();

  await db.items.where("clientId").equals(clientId).modify((i) => {
    i.deleted = true;
    i.deletedAt = now;
    i.updatedAt = now;
  });

  if (syncFlag && syncEnabled) {
    await db.syncQueue.add({
      action: "delete",
      entityType: "item",
      clientId,
      data: { deleted: true, deletedAt: now, updatedAt: now },
      timestamp: now,
    });
    triggerSync();
  } else {
    await db.items.where("clientId").equals(clientId).delete();
  }
}

export async function updateEnvVar(
  clientId: string,
  name: string,
  value: string,
  project: string,
  syncFlag: boolean
): Promise<void> {
  const now = new Date().toISOString();
  const projectName = project.trim() || DEFAULT_ENV_PROJECT;

  await db.items.where("clientId").equals(clientId).modify((i) => {
    i.title = name;
    i.content = value;
    i.tags = [projectName];
    i.updatedAt = now;
  });

  if (syncFlag && syncEnabled) {
    await db.syncQueue.add({
      action: "update",
      entityType: "item",
      clientId,
      data: { title: name, content: value, tags: [projectName], updatedAt: now },
      timestamp: now,
    });
    triggerSync();
  }
}

// ─── CREDENTIALS ───

export interface Credential {
  clientId: string;
  label: string;
  username: string;
  password: string;
}

export async function getCredentials(): Promise<Credential[]> {
  const items = await db.items.where("type").equals("credential").toArray();
  return items
    .filter((item) => !item.deleted)
    .map((item) => {
      try {
        const data = JSON.parse(item.content);
        return { clientId: item.clientId, label: item.title, username: data.username || "", password: data.password || "" };
      } catch {
        return { clientId: item.clientId, label: item.title, username: "", password: item.content };
      }
    });
}

export async function addCredential(label: string, username: string, password: string, syncFlag: boolean): Promise<void> {
  const now = new Date().toISOString();
  const clientId = uuidv4();

  const localItem: LocalItem = {
    clientId,
    type: "credential",
    title: label,
    content: JSON.stringify({ username, password }),
    tags: [],
    pinned: false,
    deviceId: getDeviceId(),
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.items.add(localItem);

  if (syncFlag && syncEnabled) {
    await db.syncQueue.add({
      action: "create",
      entityType: "item",
      clientId,
      data: localItem as unknown as Record<string, unknown>,
      timestamp: now,
    });
    triggerSync();
  }
}

export async function removeCredential(clientId: string, syncFlag: boolean): Promise<void> {
  const now = new Date().toISOString();

  await db.items.where("clientId").equals(clientId).modify((i) => {
    i.deleted = true;
    i.deletedAt = now;
    i.updatedAt = now;
  });

  if (syncFlag && syncEnabled) {
    await db.syncQueue.add({
      action: "delete",
      entityType: "item",
      clientId,
      data: { deleted: true, deletedAt: now, updatedAt: now },
      timestamp: now,
    });
    triggerSync();
  } else {
    await db.items.where("clientId").equals(clientId).delete();
  }
}
