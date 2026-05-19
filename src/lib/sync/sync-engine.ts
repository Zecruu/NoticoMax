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
import type { RealtimeChannel } from "@supabase/supabase-js";

const SYNC_KEY = "notico_last_sync";

// ─── SYNC GATE ───
// When false, all writes still go to IndexedDB but don't enqueue server sync.

let syncEnabled = false;
let currentUserId: string | null = null;

export function setSyncEnabled(enabled: boolean) {
  syncEnabled = enabled;
  if (enabled) {
    void getCurrentUserId();
  } else {
    currentUserId = null;
    teardownRealtime();
  }
}

/** Backward-compat wrapper used by hooks that still pass a licenseKey. */
export function setSyncLicenseKey(key: string | null) {
  setSyncEnabled(!!key);
}

async function getCurrentUserId(): Promise<string | null> {
  if (currentUserId) return currentUserId;
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  currentUserId = data.user?.id ?? null;
  return currentUserId;
}

function getLastSync(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(SYNC_KEY);
}

function setLastSync(timestamp: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem(SYNC_KEY, timestamp);
  }
}

// ─── FIELD MAPPING (LocalItem ↔ Supabase row) ───

interface SupabaseItem {
  client_id: string;
  user_id: string;
  type: string;
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
    user_id: userId,
    type: item.type,
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
    type: row.type as LocalItem["type"],
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
    user_id: userId,
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

interface SupabaseBudgetSettings {
  user_id: string;
  monthly_income: number;
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
  return folder?.householdId ?? undefined;
}

export async function createItem(
  item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">
): Promise<LocalItem> {
  const now = new Date().toISOString();
  const clientId = uuidv4();
  const deviceId = getDeviceId();
  const householdId = item.householdId ?? (await resolveHouseholdIdFromFolder(item.folderId));

  const localItem: LocalItem = {
    ...item,
    clientId,
    deviceId,
    householdId,
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

  if (localItem.type === "reminder" && localItem.reminderDate) {
    scheduleReminderNotification(
      clientId,
      localItem.title,
      localItem.content.substring(0, 100),
      new Date(localItem.reminderDate)
    );
  }

  triggerSync();
  return localItem;
}

export async function updateItem(
  clientId: string,
  updates: Partial<LocalItem>
): Promise<LocalItem | undefined> {
  const now = new Date().toISOString();
  const item = await db.items.where("clientId").equals(clientId).first();
  if (!item) return undefined;

  // If the folder changed (or this is the first save and householdId wasn't
  // set explicitly), re-resolve the householdId from the destination folder.
  // Moving a note into the family folder → shares it. Moving out → un-shares.
  let householdIdPatch: { householdId?: string } = {};
  if (updates.folderId !== undefined && updates.folderId !== item.folderId) {
    householdIdPatch = { householdId: await resolveHouseholdIdFromFolder(updates.folderId) };
  }

  const updatedData = { ...updates, ...householdIdPatch, updatedAt: now };
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

  triggerSync();
  return { ...item, ...updatedData };
}

export async function deleteItem(clientId: string): Promise<void> {
  const now = new Date().toISOString();

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

  items = items.filter((item) => !item.deleted && item.type !== "envvar" && item.type !== "credential");

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
    .filter((item) => item.deleted && item.type !== "envvar" && item.type !== "credential")
    .sort((a, b) => {
      const aTime = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const bTime = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return bTime - aTime;
    });
}

export async function restoreItem(clientId: string): Promise<void> {
  const now = new Date().toISOString();

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
    await db.items.where("clientId").equals(item.clientId).delete();
  }
}

// ─── FOLDER OPERATIONS ───

export async function createFolder(
  folder: Omit<LocalFolder, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">
): Promise<LocalFolder> {
  const now = new Date().toISOString();
  const clientId = uuidv4();

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
  return folders.filter((f) => !f.deleted).sort((a, b) => a.name.localeCompare(b.name));
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

export async function performSync(): Promise<boolean> {
  if (!syncEnabled) return false;
  if (syncInProgress || !navigator.onLine) return false;

  const userId = await getCurrentUserId();
  if (!userId) return false;

  syncInProgress = true;
  const supabase = getSupabaseBrowserClient();

  try {
    const queue = await db.syncQueue.orderBy("timestamp").toArray();
    if (queue.length === 0) {
      // No outgoing changes — pull anyway in case there are server changes since last sync
      await pullChanges(userId);
      return true;
    }

    // Deduplicate per (entityType, clientId), keeping latest action.
    const itemOps = new Map<string, (typeof queue)[0]>();
    const folderOps = new Map<string, (typeof queue)[0]>();
    const locationOps = new Map<string, (typeof queue)[0]>();
    const budgetCategoryOps = new Map<string, (typeof queue)[0]>();
    const budgetTransactionOps = new Map<string, (typeof queue)[0]>();
    const budgetOverrideOps = new Map<string, (typeof queue)[0]>();
    const goalOps = new Map<string, (typeof queue)[0]>();
    let budgetSettingsOp: (typeof queue)[0] | null = null;
    for (const entry of queue) {
      if (entry.entityType === "folder") folderOps.set(entry.clientId, entry);
      else if (entry.entityType === "location") locationOps.set(entry.clientId, entry);
      else if (entry.entityType === "budget_category") budgetCategoryOps.set(entry.clientId, entry);
      else if (entry.entityType === "budget_transaction") budgetTransactionOps.set(entry.clientId, entry);
      else if (entry.entityType === "budget_category_override") budgetOverrideOps.set(entry.clientId, entry);
      else if (entry.entityType === "budget_settings") budgetSettingsOp = entry;
      else if (entry.entityType === "goal") goalOps.set(entry.clientId, entry);
      else itemOps.set(entry.clientId, entry);
    }

    // Folders first (items may reference them via folder_id).
    for (const op of folderOps.values()) {
      if (op.action === "delete") {
        await supabase
          .from("folders")
          .update({ deleted: true, updated_at: op.timestamp })
          .eq("client_id", op.clientId);
      } else {
        const folder = await db.folders.where("clientId").equals(op.clientId).first();
        if (folder) {
          await supabase
            .from("folders")
            .upsert(localToSupabaseFolder(folder, userId), { onConflict: "client_id" });
        }
      }
    }

    for (const op of itemOps.values()) {
      if (op.action === "delete") {
        await supabase
          .from("items")
          .update({ deleted: true, deleted_at: op.timestamp, updated_at: op.timestamp })
          .eq("client_id", op.clientId);
      } else {
        const item = await db.items.where("clientId").equals(op.clientId).first();
        if (item) {
          await supabase
            .from("items")
            .upsert(localToSupabaseItem(item, userId), { onConflict: "client_id" });
        }
      }
    }

    for (const op of locationOps.values()) {
      if (op.action === "delete") {
        await supabase
          .from("locations")
          .update({ deleted: true, deleted_at: op.timestamp, updated_at: op.timestamp })
          .eq("client_id", op.clientId);
      } else {
        const loc = await db.locations.where("clientId").equals(op.clientId).first();
        if (loc) {
          await supabase
            .from("locations")
            .upsert(localToSupabaseLocation(loc, userId), { onConflict: "client_id" });
        }
      }
    }

    // Budget categories first (transactions FK them via category_id).
    for (const op of budgetCategoryOps.values()) {
      if (op.action === "delete") {
        await supabase
          .from("budget_categories")
          .update({ deleted: true, deleted_at: op.timestamp, updated_at: op.timestamp })
          .eq("client_id", op.clientId);
        // Cascade tombstone to transactions server-side.
        await supabase
          .from("budget_transactions")
          .update({ deleted: true, deleted_at: op.timestamp, updated_at: op.timestamp })
          .eq("category_id", op.clientId);
      } else {
        const cat = await db.budgetCategories.where("clientId").equals(op.clientId).first();
        if (cat) {
          await supabase
            .from("budget_categories")
            .upsert(localToSupabaseBudgetCategory(cat, userId), { onConflict: "client_id" });
        }
      }
    }

    for (const op of budgetTransactionOps.values()) {
      if (op.action === "delete") {
        await supabase
          .from("budget_transactions")
          .update({ deleted: true, deleted_at: op.timestamp, updated_at: op.timestamp })
          .eq("client_id", op.clientId);
      } else {
        const txn = await db.budgetTransactions.where("clientId").equals(op.clientId).first();
        if (txn) {
          await supabase
            .from("budget_transactions")
            .upsert(localToSupabaseBudgetTransaction(txn, userId), { onConflict: "client_id" });
        }
      }
    }

    for (const op of budgetOverrideOps.values()) {
      if (op.action === "delete") {
        await supabase
          .from("budget_category_overrides")
          .update({ deleted: true, deleted_at: op.timestamp, updated_at: op.timestamp })
          .eq("client_id", op.clientId);
      } else {
        const ov = await db.budgetCategoryOverrides.where("clientId").equals(op.clientId).first();
        if (ov) {
          await supabase
            .from("budget_category_overrides")
            .upsert(localToSupabaseBudgetCategoryOverride(ov, userId), { onConflict: "client_id" });
        }
      }
    }

    if (budgetSettingsOp) {
      const data = budgetSettingsOp.data as { monthly_income?: number; updated_at?: string } | undefined;
      const incomeValue = data?.monthly_income;
      const updatedAt = data?.updated_at ?? budgetSettingsOp.timestamp;
      if (typeof incomeValue === "number") {
        await supabase
          .from("budget_settings")
          .upsert(
            { user_id: userId, monthly_income: incomeValue, updated_at: updatedAt },
            { onConflict: "user_id" },
          );
      }
    }

    for (const op of goalOps.values()) {
      if (op.action === "delete") {
        await supabase
          .from("goals")
          .update({ deleted: true, deleted_at: op.timestamp, updated_at: op.timestamp })
          .eq("client_id", op.clientId);
      } else {
        const goal = await db.goals.where("clientId").equals(op.clientId).first();
        if (goal) {
          await supabase
            .from("goals")
            .upsert(localToSupabaseGoal(goal, userId), { onConflict: "client_id" });
        }
      }
    }

    await db.syncQueue.clear();
    await pullChanges(userId);
    setLastSync(new Date().toISOString());
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Sync error:", message);
    if (onSyncError) onSyncError(message);
    return false;
  } finally {
    syncInProgress = false;
  }
}

async function pullChanges(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const lastSync = getLastSync();

  let itemsQuery = supabase.from("items").select("*").eq("user_id", userId);
  if (lastSync) itemsQuery = itemsQuery.gt("updated_at", lastSync);
  const { data: items } = await itemsQuery;

  if (items) {
    for (const row of items as SupabaseItem[]) {
      const mapped = supabaseToLocalItem(row);
      const existing = await db.items.where("clientId").equals(mapped.clientId).first();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          await db.items.where("clientId").equals(mapped.clientId).modify((i) => {
            Object.assign(i, mapped);
          });
        }
      } else {
        await db.items.add(mapped);
      }
    }
  }

  let foldersQuery = supabase.from("folders").select("*").eq("user_id", userId);
  if (lastSync) foldersQuery = foldersQuery.gt("updated_at", lastSync);
  const { data: folders } = await foldersQuery;

  if (folders) {
    for (const row of folders as SupabaseFolder[]) {
      const mapped = supabaseToLocalFolder(row);
      const existing = await db.folders.where("clientId").equals(mapped.clientId).first();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          await db.folders.where("clientId").equals(mapped.clientId).modify((f) => {
            Object.assign(f, mapped);
          });
        }
      } else {
        await db.folders.add(mapped);
      }
    }
  }

  let locationsQuery = supabase.from("locations").select("*").eq("user_id", userId);
  if (lastSync) locationsQuery = locationsQuery.gt("updated_at", lastSync);
  const { data: locations } = await locationsQuery;

  if (locations) {
    for (const row of locations as SupabaseLocation[]) {
      const mapped = supabaseToLocalLocation(row);
      const existing = await db.locations.where("clientId").equals(mapped.clientId).first();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          await db.locations.where("clientId").equals(mapped.clientId).modify((l) => {
            Object.assign(l, mapped);
          });
        }
      } else {
        await db.locations.add(mapped);
      }
    }
  }

  let bcQuery = supabase.from("budget_categories").select("*").eq("user_id", userId);
  if (lastSync) bcQuery = bcQuery.gt("updated_at", lastSync);
  const { data: budgetCats } = await bcQuery;
  if (budgetCats) {
    for (const row of budgetCats as SupabaseBudgetCategory[]) {
      const mapped = supabaseToLocalBudgetCategory(row);
      const existing = await db.budgetCategories.where("clientId").equals(mapped.clientId).first();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          await db.budgetCategories.where("clientId").equals(mapped.clientId).modify((c) => {
            Object.assign(c, mapped);
          });
        }
      } else {
        await db.budgetCategories.add(mapped);
      }
    }
  }

  let btQuery = supabase.from("budget_transactions").select("*").eq("user_id", userId);
  if (lastSync) btQuery = btQuery.gt("updated_at", lastSync);
  const { data: budgetTxns } = await btQuery;
  if (budgetTxns) {
    for (const row of budgetTxns as SupabaseBudgetTransaction[]) {
      const mapped = supabaseToLocalBudgetTransaction(row);
      const existing = await db.budgetTransactions.where("clientId").equals(mapped.clientId).first();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          await db.budgetTransactions.where("clientId").equals(mapped.clientId).modify((t) => {
            Object.assign(t, mapped);
          });
        }
      } else {
        await db.budgetTransactions.add(mapped);
      }
    }
  }

  let bovQuery = supabase.from("budget_category_overrides").select("*").eq("user_id", userId);
  if (lastSync) bovQuery = bovQuery.gt("updated_at", lastSync);
  const { data: budgetOverrides } = await bovQuery;
  if (budgetOverrides) {
    for (const row of budgetOverrides as SupabaseBudgetCategoryOverride[]) {
      const mapped = supabaseToLocalBudgetCategoryOverride(row);
      const existing = await db.budgetCategoryOverrides.where("clientId").equals(mapped.clientId).first();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          await db.budgetCategoryOverrides.where("clientId").equals(mapped.clientId).modify((o) => {
            Object.assign(o, mapped);
          });
        }
      } else {
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
    .maybeSingle();
  if (settings && typeof window !== "undefined") {
    const pending = await db.syncQueue
      .where("entityType")
      .equals("budget_settings")
      .count();
    if (pending === 0) {
      localStorage.setItem(MONTHLY_INCOME_KEY, String(Number(settings.monthly_income) || 0));
    }
  }

  let goalsQuery = supabase.from("goals").select("*").eq("user_id", userId);
  if (lastSync) goalsQuery = goalsQuery.gt("updated_at", lastSync);
  const { data: goals } = await goalsQuery;
  if (goals) {
    for (const row of goals as SupabaseGoal[]) {
      const mapped = supabaseToLocalGoal(row);
      const existing = await db.goals.where("clientId").equals(mapped.clientId).first();
      if (existing) {
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          await db.goals.where("clientId").equals(mapped.clientId).modify((g) => {
            Object.assign(g, mapped);
          });
        }
      } else {
        await db.goals.add(mapped);
      }
    }
  }
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function triggerSync() {
  if (!syncEnabled) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    performSync();
  }, 1000);
}

export async function initialSync(): Promise<void> {
  if (!syncEnabled) return;
  if (!navigator.onLine) return;

  const userId = await getCurrentUserId();
  if (!userId) return;

  // Full pull, ignoring lastSync. Safe because we merge by client_id.
  const previousLastSync = localStorage.getItem(SYNC_KEY);
  localStorage.removeItem(SYNC_KEY);
  try {
    await pullChanges(userId);
    setLastSync(new Date().toISOString());
  } catch (error) {
    if (previousLastSync) localStorage.setItem(SYNC_KEY, previousLastSync);
    console.error("Initial sync error:", error);
  }
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
  const userId = await getCurrentUserId();
  if (!userId) return;

  const supabase = getSupabaseBrowserClient();
  realtimeChannel = supabase
    .channel(`user-${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "items", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseItem | undefined;
        if (!row) return;
        const mapped = supabaseToLocalItem(row);
        const existing = await db.items.where("clientId").equals(mapped.clientId).first();
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          if (existing) {
            await db.items.where("clientId").equals(mapped.clientId).modify((i) => {
              Object.assign(i, mapped);
            });
          } else {
            await db.items.add(mapped);
          }
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "folders", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseFolder | undefined;
        if (!row) return;
        const mapped = supabaseToLocalFolder(row);
        const existing = await db.folders.where("clientId").equals(mapped.clientId).first();
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          if (existing) {
            await db.folders.where("clientId").equals(mapped.clientId).modify((f) => {
              Object.assign(f, mapped);
            });
          } else {
            await db.folders.add(mapped);
          }
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "locations", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseLocation | undefined;
        if (!row) return;
        const mapped = supabaseToLocalLocation(row);
        const existing = await db.locations.where("clientId").equals(mapped.clientId).first();
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          if (existing) {
            await db.locations.where("clientId").equals(mapped.clientId).modify((l) => {
              Object.assign(l, mapped);
            });
          } else {
            await db.locations.add(mapped);
          }
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "budget_categories", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseBudgetCategory | undefined;
        if (!row) return;
        const mapped = supabaseToLocalBudgetCategory(row);
        const existing = await db.budgetCategories.where("clientId").equals(mapped.clientId).first();
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          if (existing) {
            await db.budgetCategories.where("clientId").equals(mapped.clientId).modify((c) => {
              Object.assign(c, mapped);
            });
          } else {
            await db.budgetCategories.add(mapped);
          }
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "budget_transactions", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseBudgetTransaction | undefined;
        if (!row) return;
        const mapped = supabaseToLocalBudgetTransaction(row);
        const existing = await db.budgetTransactions.where("clientId").equals(mapped.clientId).first();
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          if (existing) {
            await db.budgetTransactions.where("clientId").equals(mapped.clientId).modify((t) => {
              Object.assign(t, mapped);
            });
          } else {
            await db.budgetTransactions.add(mapped);
          }
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "budget_category_overrides", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseBudgetCategoryOverride | undefined;
        if (!row) return;
        const mapped = supabaseToLocalBudgetCategoryOverride(row);
        const existing = await db.budgetCategoryOverrides.where("clientId").equals(mapped.clientId).first();
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          if (existing) {
            await db.budgetCategoryOverrides.where("clientId").equals(mapped.clientId).modify((o) => {
              Object.assign(o, mapped);
            });
          } else {
            await db.budgetCategoryOverrides.add(mapped);
          }
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "budget_settings", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseBudgetSettings | undefined;
        if (!row) return;
        const pending = await db.syncQueue.where("entityType").equals("budget_settings").count();
        if (pending === 0 && typeof window !== "undefined") {
          localStorage.setItem(MONTHLY_INCOME_KEY, String(Number(row.monthly_income) || 0));
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "goals", filter: `user_id=eq.${userId}` },
      async (payload: { new: unknown; old: unknown }) => {
        const row = (payload.new ?? payload.old) as SupabaseGoal | undefined;
        if (!row) return;
        const mapped = supabaseToLocalGoal(row);
        const existing = await db.goals.where("clientId").equals(mapped.clientId).first();
        const hasPending = await db.syncQueue.where("clientId").equals(mapped.clientId).count();
        if (hasPending === 0) {
          if (existing) {
            await db.goals.where("clientId").equals(mapped.clientId).modify((g) => {
              Object.assign(g, mapped);
            });
          } else {
            await db.goals.add(mapped);
          }
        }
        if (onSyncComplete) onSyncComplete();
      }
    )
    .subscribe();
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
    if (didSync && onSyncComplete) onSyncComplete();
  };

  window.addEventListener("online", onOnline);

  // Realtime supersedes polling — but pull on visibility change in case realtime
  // dropped a message while the tab was hidden.
  const onVisibilityChange = async () => {
    if (document.visibilityState === "visible" && syncEnabled && navigator.onLine) {
      const didSync = await performSync();
      if (didSync && onSyncComplete) onSyncComplete();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Spin up realtime if we're already enabled
  if (syncEnabled) void setupRealtime();

  return () => {
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
