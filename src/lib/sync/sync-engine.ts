import db, { type LocalItem, type LocalFolder } from "@/lib/db/indexed-db";
import { v4 as uuidv4 } from "uuid";
import {
  scheduleReminderNotification,
  cancelReminderNotification,
} from "@/lib/capacitor/local-notifications";

const SYNC_KEY = "notico_last_sync";

// ─── TIER GATING ───

export type SyncTier = "free" | "pro" | "anonymous";
let currentTier: SyncTier = "anonymous";

export function setSyncTier(tier: SyncTier) {
  currentTier = tier;
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

// ─── ITEM OPERATIONS ───

export async function createItem(
  item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">
): Promise<LocalItem> {
  const now = new Date().toISOString();
  const clientId = uuidv4();

  const localItem: LocalItem = {
    ...item,
    clientId,
    deleted: false,
    createdAt: now,
    updatedAt: now,
  };

  await db.items.add(localItem);

  await db.syncQueue.add({
    action: "create",
    entityType: "item",
    clientId,
    data: localItem as unknown as Record<string, unknown>,
    timestamp: now,
  });

  // Schedule native notification for reminders
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

  // Cancel any scheduled native notification
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

  // Filter out deleted items
  items = items.filter((item) => !item.deleted);

  // Filter by folder
  if (folderId) {
    items = items.filter((item) => item.folderId === folderId);
  }

  // Client-side search
  if (searchQuery) {
    const terms = searchQuery.toLowerCase().split(/\s+/);
    items = items.filter((item) => {
      const searchable = `${item.title} ${item.content} ${item.tags.join(" ")} ${item.url || ""}`.toLowerCase();
      return terms.every((term) => searchable.includes(term));
    });
  }

  // Sort: pinned first, then by updatedAt descending
  items.sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  return items;
}

// ─── TRASH OPERATIONS ───

export async function getDeletedItems(): Promise<LocalItem[]> {
  const items = await db.items.toArray();
  return items
    .filter((item) => item.deleted)
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

  // Soft-delete the folder
  await db.folders.where("clientId").equals(clientId).modify((f) => {
    f.deleted = true;
    f.updatedAt = now;
  });

  // Cascade: soft-delete all items in this folder
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
  return folders
    .filter((f) => !f.deleted)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ─── SYNC ───

let syncInProgress = false;

export async function performSync(): Promise<boolean> {
  if (currentTier !== "pro") return false;
  if (syncInProgress || !navigator.onLine) return false;

  syncInProgress = true;

  try {
    const queue = await db.syncQueue.orderBy("timestamp").toArray();

    // Separate item and folder operations, deduplicate per clientId
    const itemOps = new Map<string, (typeof queue)[0]>();
    const folderOps = new Map<string, (typeof queue)[0]>();

    for (const entry of queue) {
      if (entry.entityType === "folder") {
        folderOps.set(entry.clientId, entry);
      } else {
        itemOps.set(entry.clientId, entry);
      }
    }

    const operations = Array.from(itemOps.values()).map((e) => ({
      action: e.action,
      clientId: e.clientId,
      data: e.data,
    }));

    const folderOperations = Array.from(folderOps.values()).map((e) => ({
      action: e.action,
      clientId: e.clientId,
      data: e.data,
    }));

    const lastSyncAt = getLastSync();

    const response = await fetch("/api/items/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operations, folderOperations, lastSyncAt }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Sync failed: ${response.status} ${errorBody}`);
    }

    const { serverItems, serverFolders, syncedAt } = await response.json();

    await db.syncQueue.clear();

    // Merge server items
    for (const serverItem of serverItems) {
      const localItem = await db.items.where("clientId").equals(serverItem.clientId).first();

      const mapped: LocalItem = {
        clientId: serverItem.clientId,
        serverId: serverItem._id,
        type: serverItem.type,
        title: serverItem.title,
        content: serverItem.content || "",
        url: serverItem.url,
        reminderDate: serverItem.reminderDate,
        reminderCompleted: serverItem.reminderCompleted,
        tags: serverItem.tags || [],
        pinned: serverItem.pinned || false,
        color: serverItem.color,
        folderId: serverItem.folderId,
        deleted: serverItem.deleted || false,
        createdAt: serverItem.createdAt,
        updatedAt: serverItem.updatedAt,
      };

      if (localItem) {
        await db.items.where("clientId").equals(serverItem.clientId).modify((i) => { Object.assign(i, mapped); });
      } else {
        await db.items.add(mapped);
      }
    }

    // Merge server folders
    if (serverFolders) {
      for (const serverFolder of serverFolders) {
        const localFolder = await db.folders.where("clientId").equals(serverFolder.clientId).first();

        const mapped: LocalFolder = {
          clientId: serverFolder.clientId,
          serverId: serverFolder._id,
          name: serverFolder.name,
          color: serverFolder.color,
          deleted: serverFolder.deleted || false,
          createdAt: serverFolder.createdAt,
          updatedAt: serverFolder.updatedAt,
        };

        if (localFolder) {
          await db.folders.where("clientId").equals(serverFolder.clientId).modify((f) => { Object.assign(f, mapped); });
        } else {
          await db.folders.add(mapped);
        }
      }
    }

    setLastSync(syncedAt);
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

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

export function triggerSync() {
  if (currentTier !== "pro") return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    performSync();
  }, 1000);
}

export async function initialSync(): Promise<void> {
  if (currentTier !== "pro") return;
  if (!navigator.onLine) return;

  try {
    // Sync items
    const itemsRes = await fetch("/api/items");
    if (itemsRes.ok) {
      const serverItems = await itemsRes.json();
      for (const serverItem of serverItems) {
        const localItem = await db.items.where("clientId").equals(serverItem.clientId).first();

        const mapped: LocalItem = {
          clientId: serverItem.clientId,
          serverId: serverItem._id,
          type: serverItem.type,
          title: serverItem.title,
          content: serverItem.content || "",
          url: serverItem.url,
          reminderDate: serverItem.reminderDate,
          reminderCompleted: serverItem.reminderCompleted,
          tags: serverItem.tags || [],
          pinned: serverItem.pinned || false,
          color: serverItem.color,
          folderId: serverItem.folderId,
          deleted: serverItem.deleted || false,
          createdAt: serverItem.createdAt,
          updatedAt: serverItem.updatedAt,
        };

        if (!localItem) {
          await db.items.add(mapped);
        } else {
          const hasPending = await db.syncQueue.where("clientId").equals(serverItem.clientId).count();
          if (hasPending === 0) {
            await db.items.where("clientId").equals(serverItem.clientId).modify((i) => { Object.assign(i, mapped); });
          }
        }
      }
    }

    // Sync folders
    const foldersRes = await fetch("/api/folders");
    if (foldersRes.ok) {
      const serverFolders = await foldersRes.json();
      for (const serverFolder of serverFolders) {
        const localFolder = await db.folders.where("clientId").equals(serverFolder.clientId).first();

        const mapped: LocalFolder = {
          clientId: serverFolder.clientId,
          serverId: serverFolder._id,
          name: serverFolder.name,
          color: serverFolder.color,
          deleted: serverFolder.deleted || false,
          createdAt: serverFolder.createdAt,
          updatedAt: serverFolder.updatedAt,
        };

        if (!localFolder) {
          await db.folders.add(mapped);
        } else {
          const hasPending = await db.syncQueue.where("clientId").equals(serverFolder.clientId).count();
          if (hasPending === 0) {
            await db.folders.where("clientId").equals(serverFolder.clientId).modify((f) => { Object.assign(f, mapped); });
          }
        }
      }
    }

    setLastSync(new Date().toISOString());
  } catch (error) {
    console.error("Initial sync error:", error);
  }
}

const POLL_INTERVAL_MS = 30_000; // Poll every 30 seconds for cross-device sync

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

  // Periodic polling for cross-device sync
  const intervalId = setInterval(async () => {
    if (currentTier !== "pro" || !navigator.onLine) return;
    const didSync = await performSync();
    if (didSync && onSyncComplete) onSyncComplete();
  }, POLL_INTERVAL_MS);

  // Pull server changes when tab regains focus (user switching devices)
  const onVisibilityChange = async () => {
    if (document.visibilityState === "visible" && currentTier === "pro" && navigator.onLine) {
      const didSync = await performSync();
      if (didSync && onSyncComplete) onSyncComplete();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Return cleanup function
  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    clearInterval(intervalId);
  };
}
