import db, { type LocalItem, type LocalFolder } from "@/lib/db/indexed-db";
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
  tags: string[];
  pinned: boolean;
  color: string | null;
  folder_id: string | null;
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
    tags: item.tags ?? [],
    pinned: item.pinned ?? false,
    color: item.color ?? null,
    folder_id: item.folderId ?? null,
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
    tags: row.tags ?? [],
    pinned: row.pinned ?? false,
    color: row.color ?? undefined,
    folderId: row.folder_id ?? undefined,
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
    deleted: row.deleted ?? false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── ITEM OPERATIONS (write through IndexedDB → enqueue → flush) ───

export async function createItem(
  item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">
): Promise<LocalItem> {
  const now = new Date().toISOString();
  const clientId = uuidv4();
  const deviceId = getDeviceId();

  const localItem: LocalItem = {
    ...item,
    clientId,
    deviceId,
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

  const updatedData = { ...updates, updatedAt: now };
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
    for (const entry of queue) {
      if (entry.entityType === "folder") folderOps.set(entry.clientId, entry);
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
