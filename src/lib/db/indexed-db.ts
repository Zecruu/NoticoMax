import Dexie, { type EntityTable } from "dexie";

export type ItemType = "note" | "url" | "reminder" | "envvar" | "credential";

/**
 * Reminder recurrence rule. "none" = one-shot. Other values mean the
 * reminder repeats forever from its original date at the given cadence.
 * Birthdays/anniversaries are yearly; standups are weekly; etc.
 *
 * v1 is client-only — the field doesn't currently round-trip through
 * the Supabase items table schema. Add a `recurrence` text column there
 * if/when you want this to sync across devices.
 */
export type RecurrenceRule = "none" | "daily" | "weekly" | "monthly" | "yearly";

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
  recurrence?: RecurrenceRule;
  tags: string[];
  pinned: boolean;
  color?: string;
  folderId?: string;
  deviceId?: string;
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

export interface StudyCard {
  term: string;
  definition: string;
}

export interface LocalStudySet {
  id?: number;
  clientId: string;
  name: string;
  cards: StudyCard[];
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuizOption {
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  question: string;
  options: QuizOption[];
}

export interface LocalQuiz {
  id?: number;
  clientId: string;
  name: string;
  questions: QuizQuestion[];
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalBudgetCategory {
  id?: number;
  clientId: string;
  name: string;
  color: string;
  monthlyLimit: number;
  createdAt: string;
  updatedAt: string;
  deleted: boolean;
}

export interface LocalBudgetTransaction {
  id?: number;
  clientId: string;
  categoryId: string;
  amount: number;
  note?: string;
  date: string;
  createdAt: string;
}

export type GoalScope = "today" | "month" | "year";

export interface LocalGoal {
  id?: number;
  clientId: string;
  title: string;
  scope: GoalScope;
  /** YYYY-MM-DD (today), YYYY-MM (month), YYYY (year) — the period this goal targets. */
  periodKey: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalLocation {
  id?: number;
  clientId: string;
  serverId?: string;
  name: string;
  address?: string;
  latitude: number;
  longitude: number;
  notes?: string;
  tags: string[];
  pinned: boolean;
  color?: string;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueEntry {
  id?: number;
  action: "create" | "update" | "delete";
  entityType: "item" | "folder" | "location";
  clientId: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

class NoticoDatabase extends Dexie {
  items!: EntityTable<LocalItem, "id">;
  folders!: EntityTable<LocalFolder, "id">;
  studySets!: EntityTable<LocalStudySet, "id">;
  quizzes!: EntityTable<LocalQuiz, "id">;
  budgetCategories!: EntityTable<LocalBudgetCategory, "id">;
  budgetTransactions!: EntityTable<LocalBudgetTransaction, "id">;
  goals!: EntityTable<LocalGoal, "id">;
  locations!: EntityTable<LocalLocation, "id">;
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

    this.version(3).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });

    this.version(4).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      quizzes: "++id, clientId, name, deleted",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });

    this.version(5).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      quizzes: "++id, clientId, name, deleted",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });

    this.version(6).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      quizzes: "++id, clientId, name, deleted",
      budgetCategories: "++id, clientId, name, deleted",
      budgetTransactions: "++id, clientId, categoryId, date",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });

    this.version(7).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      quizzes: "++id, clientId, name, deleted",
      budgetCategories: "++id, clientId, name, deleted",
      budgetTransactions: "++id, clientId, categoryId, date",
      goals: "++id, clientId, scope, periodKey, completed, createdAt",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });

    this.version(8).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      quizzes: "++id, clientId, name, deleted",
      budgetCategories: "++id, clientId, name, deleted",
      budgetTransactions: "++id, clientId, categoryId, date",
      goals: "++id, clientId, scope, periodKey, completed, createdAt",
      locations: "++id, clientId, serverId, name, updatedAt, pinned, deleted, deviceId",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });
  }
}

const db = new NoticoDatabase();

export default db;

/**
 * Clear all locally cached items, folders, study sets, quizzes, and the sync
 * queue. Use when a different user signs in on the device — local IndexedDB
 * is shared across logins, so without this, the new user would see the prior
 * user's data.
 *
 * Does NOT touch localStorage or sessionStorage (use-license handles those).
 */
export async function wipeLocalDB(): Promise<void> {
  await Promise.all([
    db.items.clear(),
    db.folders.clear(),
    db.studySets.clear(),
    db.quizzes.clear(),
    db.budgetCategories.clear(),
    db.budgetTransactions.clear(),
    db.goals.clear(),
    db.locations.clear(),
    db.syncQueue.clear(),
  ]);
}
