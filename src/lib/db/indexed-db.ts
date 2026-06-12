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
  /** Inherited from the parent folder when saved into a shared folder. */
  householdId?: string;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type FolderShareMode = "all" | "select";

export interface LocalFolder {
  id?: number;
  clientId: string;
  serverId?: string;
  name: string;
  color?: string;
  /** When set, the folder belongs to this household and is shared per `shareMode`. */
  householdId?: string;
  /** Defaults to "all" when household_id is set — preserves Ship 1b behavior. */
  shareMode?: FolderShareMode;
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
  serverId?: string;
  name: string;
  color: string;
  monthlyLimit: number;
  /** When set, this category is shared with every member of the household. */
  householdId?: string;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalBudgetTransaction {
  id?: number;
  clientId: string;
  serverId?: string;
  categoryId: string;
  amount: number;
  note?: string;
  date: string;
  /** Inherited from the parent category. */
  householdId?: string;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalBudgetCategoryOverride {
  id?: number;
  clientId: string;
  serverId?: string;
  categoryId: string;
  /** "YYYY-MM" */
  monthKey: string;
  monthlyLimit: number;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type GoalScope = "today" | "month" | "year";

export interface LocalGoal {
  id?: number;
  clientId: string;
  serverId?: string;
  title: string;
  scope: GoalScope;
  /** YYYY-MM-DD (today), YYYY-MM (month), YYYY (year) — the period this goal targets. */
  periodKey: string;
  completed: boolean;
  completedAt?: string;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalBill {
  id?: number;
  clientId: string;
  serverId?: string;
  name: string;
  amount: number;
  /** ISO date (YYYY-MM-DD or full timestamp). Optional — bills can be undated. */
  dueDate?: string;
  paid: boolean;
  paidAt?: string;
  /**
   * client_id of the budget_transaction created when the bill was marked
   * paid. Lets us undo the payment (delete the tx) if the user un-marks.
   */
  paidTransactionId?: string;
  /** Budget category to log against on Mark Paid. Defaults to the "Bills" category. */
  categoryId?: string;
  /** Family-shared when set, mirroring items/folders/locations. */
  householdId?: string;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
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
  /** When set, this location is shared with every member of the household. */
  householdId?: string;
  deviceId?: string;
  deleted: boolean;
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncQueueEntry {
  id?: number;
  action: "create" | "update" | "delete";
  entityType: "item" | "folder" | "location" | "budget_category" | "budget_transaction" | "budget_settings" | "budget_category_override" | "goal";
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
  budgetCategoryOverrides!: EntityTable<LocalBudgetCategoryOverride, "id">;
  goals!: EntityTable<LocalGoal, "id">;
  locations!: EntityTable<LocalLocation, "id">;
  bills!: EntityTable<LocalBill, "id">;
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

    // v9 — budget categories & transactions become sync-aware (serverId,
    // deviceId, updatedAt, deleted on transactions). Existing rows are
    // migrated: any row missing the new fields gets sensible defaults so
    // a returning device upgrade doesn't lose history.
    this.version(9)
      .stores({
        items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
        folders: "++id, clientId, serverId, name, deleted",
        studySets: "++id, clientId, name, deleted",
        quizzes: "++id, clientId, name, deleted",
        budgetCategories: "++id, clientId, serverId, name, updatedAt, deleted, deviceId",
        budgetTransactions: "++id, clientId, serverId, categoryId, date, updatedAt, deleted, deviceId",
        goals: "++id, clientId, scope, periodKey, completed, createdAt",
        locations: "++id, clientId, serverId, name, updatedAt, pinned, deleted, deviceId",
        syncQueue: "++id, clientId, action, entityType, timestamp",
      })
      .upgrade(async (tx) => {
        const nowIso = new Date().toISOString();
        await tx.table("budgetTransactions").toCollection().modify((t: LocalBudgetTransaction) => {
          if (t.deleted === undefined) t.deleted = false;
          if (!t.updatedAt) t.updatedAt = t.createdAt || nowIso;
        });
        await tx.table("budgetCategories").toCollection().modify((c: LocalBudgetCategory) => {
          if (c.deleted === undefined) c.deleted = false;
        });
      });

    // v10 — goals become sync-aware. Adds serverId, deviceId, deleted, deletedAt;
    // existing local goals get backfilled with deleted=false so they survive the
    // schema bump.
    this.version(10)
      .stores({
        items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
        folders: "++id, clientId, serverId, name, deleted",
        studySets: "++id, clientId, name, deleted",
        quizzes: "++id, clientId, name, deleted",
        budgetCategories: "++id, clientId, serverId, name, updatedAt, deleted, deviceId",
        budgetTransactions: "++id, clientId, serverId, categoryId, date, updatedAt, deleted, deviceId",
        goals: "++id, clientId, serverId, scope, periodKey, completed, updatedAt, deleted, deviceId",
        locations: "++id, clientId, serverId, name, updatedAt, pinned, deleted, deviceId",
        syncQueue: "++id, clientId, action, entityType, timestamp",
      })
      .upgrade(async (tx) => {
        await tx.table("goals").toCollection().modify((g: LocalGoal) => {
          if (g.deleted === undefined) g.deleted = false;
        });
      });

    // v11 — per-month category limit overrides. Fresh store, no migration.
    this.version(11).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      quizzes: "++id, clientId, name, deleted",
      budgetCategories: "++id, clientId, serverId, name, updatedAt, deleted, deviceId",
      budgetTransactions: "++id, clientId, serverId, categoryId, date, updatedAt, deleted, deviceId",
      budgetCategoryOverrides: "++id, clientId, serverId, categoryId, monthKey, [categoryId+monthKey], updatedAt, deleted, deviceId",
      goals: "++id, clientId, serverId, scope, periodKey, completed, updatedAt, deleted, deviceId",
      locations: "++id, clientId, serverId, name, updatedAt, pinned, deleted, deviceId",
      syncQueue: "++id, clientId, action, entityType, timestamp",
    });

    // v12 — bills. Upcoming/unpaid bills that the user explicitly marks paid;
    // marking paid creates a budget_transaction and stamps paidTransactionId
    // for undo. Local-only for now (no serverId in the index yet) — sync can
    // be wired later by adding a serverId index and a sync-engine push path.
    this.version(12).stores({
      items: "++id, clientId, serverId, type, title, updatedAt, pinned, deleted, folderId, deviceId",
      folders: "++id, clientId, serverId, name, deleted",
      studySets: "++id, clientId, name, deleted",
      quizzes: "++id, clientId, name, deleted",
      budgetCategories: "++id, clientId, serverId, name, updatedAt, deleted, deviceId",
      budgetTransactions: "++id, clientId, serverId, categoryId, date, updatedAt, deleted, deviceId",
      budgetCategoryOverrides: "++id, clientId, serverId, categoryId, monthKey, [categoryId+monthKey], updatedAt, deleted, deviceId",
      goals: "++id, clientId, serverId, scope, periodKey, completed, updatedAt, deleted, deviceId",
      locations: "++id, clientId, serverId, name, updatedAt, pinned, deleted, deviceId",
      bills: "++id, clientId, paid, dueDate, updatedAt, deleted",
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
    db.budgetCategoryOverrides.clear(),
    db.goals.clear(),
    db.locations.clear(),
    db.bills.clear(),
    db.syncQueue.clear(),
  ]);
}
