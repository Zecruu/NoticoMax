import Dexie, { type EntityTable } from "dexie";

export type ItemType = "note" | "url" | "reminder";

export interface LocalItem {
  id?: number;
  clientId: string;
  serverId?: string;
  type: ItemType;
  title: string;
  content: string;
  url?: string;
  reminderDate?: string;
  reminderCompleted?: boolean;
  tags: string[];
  pinned: boolean;
  color?: string;
  folderId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalFolder {
  id?: number;
  clientId: string;
  serverId?: string;
  name: string;
  color?: string;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueEntry {
  id?: number;
  action: "create" | "update" | "delete";
  entityType: "item" | "folder";
  clientId: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class NoticoDatabase extends Dexie {
  items!: EntityTable<LocalItem, "id">;
  folders!: EntityTable<LocalFolder, "id">;
  syncQueue!: EntityTable<SyncQueueEntry, "id">;

  constructor() {
    super("NoticoAppDB");

    this.version(1).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted",
      syncQueue: "++id, clientId, action, timestamp",
    });

    this.version(2).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId",
      folders: "++id, clientId, serverId, name, deleted",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });
  }
}

const db = new NoticoDatabase();

export default db;
