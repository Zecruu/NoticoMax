"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, {
  type LocalBudgetCategory,
  type LocalBudgetTransaction,
} from "@/lib/db/indexed-db";
import {
  createBudgetCategory,
  deleteBudgetCategory,
  createBudgetTransaction,
  deleteBudgetTransaction,
  setMonthlyIncome as setMonthlyIncomeSynced,
  setBudgetCategoryOverride,
} from "@/lib/sync/sync-engine";

// Must match the key used by sync-engine so cross-device sync stays consistent.
const INCOME_KEY = "noticomax_budget_monthly_income";

export function getCurrentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

export function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return getCurrentMonthKey(d);
}

export interface BudgetCategoryWithTotals extends LocalBudgetCategory {
  spentInMonth: number;
  remaining: number;
  percent: number;
  spentThisMonth: number;
  /** monthlyLimit with any per-month override applied for the viewed month. */
  effectiveLimit: number;
  /** True when the viewed month uses a custom limit, not the category default. */
  hasOverride: boolean;
}

export interface MonthSummary {
  monthKey: string;
  totalSpent: number;
  topCategoryName: string | null;
  topCategorySpent: number;
}

export function useBudget(viewMonthKey: string = getCurrentMonthKey()) {
  const [monthlyIncome, setMonthlyIncomeState] = useState<number>(0);

  // Hydrate from localStorage on mount, and stay in sync with realtime
  // updates from other devices (sync-engine writes to the same key).
  useEffect(() => {
    const read = () => {
      const stored = localStorage.getItem(INCOME_KEY);
      if (stored) {
        const n = Number(stored);
        if (!Number.isNaN(n)) setMonthlyIncomeState(n);
      }
    };
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === INCOME_KEY) read();
    };
    window.addEventListener("storage", onStorage);
    // Realtime callbacks in sync-engine write to localStorage but don't fire
    // a `storage` event in the same tab, so also poll on visibility change.
    const onVis = () => { if (document.visibilityState === "visible") read(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const setMonthlyIncome = useCallback((amount: number) => {
    setMonthlyIncomeState(amount);
    void setMonthlyIncomeSynced(amount);
  }, []);

  const categories = useLiveQuery(
    () => db.budgetCategories.toArray().then((r) => r.filter((c) => !c.deleted)),
    [],
    [] as LocalBudgetCategory[],
  );

  const transactions = useLiveQuery(
    () => db.budgetTransactions.toArray().then((r) => r.filter((t) => !t.deleted)),
    [],
    [] as LocalBudgetTransaction[],
  );

  // Per-month limit overrides for the viewed month. Re-runs whenever the
  // viewed month changes (Dexie's useLiveQuery captures viewMonthKey in deps).
  const overridesForMonth = useLiveQuery(
    async () => {
      const all = await db.budgetCategoryOverrides.toArray();
      const map = new Map<string, number>();
      for (const o of all) {
        if (o.deleted) continue;
        if (o.monthKey !== viewMonthKey) continue;
        map.set(o.categoryId, o.monthlyLimit);
      }
      return map;
    },
    [viewMonthKey],
    new Map<string, number>(),
  );

  const txByCategoryAndMonth = useMemo(() => {
    const map = new Map<string, LocalBudgetTransaction[]>();
    for (const tx of transactions ?? []) {
      const key = `${tx.categoryId}|${monthKeyOf(tx.date)}`;
      const arr = map.get(key) ?? [];
      arr.push(tx);
      map.set(key, arr);
    }
    return map;
  }, [transactions]);

  const categoriesWithTotals: BudgetCategoryWithTotals[] = (categories ?? []).map((cat) => {
    const txs = txByCategoryAndMonth.get(`${cat.clientId}|${viewMonthKey}`) ?? [];
    const spent = txs.reduce((sum, t) => sum + t.amount, 0);
    const override = overridesForMonth?.get(cat.clientId);
    const effectiveLimit = typeof override === "number" ? override : cat.monthlyLimit;
    const remaining = effectiveLimit - spent;
    const percent = effectiveLimit > 0 ? (spent / effectiveLimit) * 100 : 0;
    return {
      ...cat,
      spentInMonth: spent,
      spentThisMonth: spent,
      remaining,
      percent,
      effectiveLimit,
      hasOverride: typeof override === "number",
    };
  });

  const totalBudgeted = categoriesWithTotals.reduce((s, c) => s + c.effectiveLimit, 0);
  const totalSpent = categoriesWithTotals.reduce((s, c) => s + c.spentInMonth, 0);
  const unallocated = monthlyIncome - totalBudgeted;
  const incomeRemaining = monthlyIncome - totalSpent;

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(getCurrentMonthKey());
    for (const tx of transactions ?? []) set.add(monthKeyOf(tx.date));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const monthSummaries: MonthSummary[] = useMemo(() => {
    const byMonth = new Map<string, Map<string, number>>();
    for (const tx of transactions ?? []) {
      const mk = monthKeyOf(tx.date);
      const cats = byMonth.get(mk) ?? new Map();
      cats.set(tx.categoryId, (cats.get(tx.categoryId) ?? 0) + tx.amount);
      byMonth.set(mk, cats);
    }
    const nameOf = new Map((categories ?? []).map((c) => [c.clientId, c.name]));
    return availableMonths.map((monthKey) => {
      const cats = byMonth.get(monthKey);
      if (!cats || cats.size === 0) {
        return { monthKey, totalSpent: 0, topCategoryName: null, topCategorySpent: 0 };
      }
      let topId = "";
      let topSpent = 0;
      let total = 0;
      for (const [id, amount] of cats) {
        total += amount;
        if (amount > topSpent) {
          topSpent = amount;
          topId = id;
        }
      }
      return {
        monthKey,
        totalSpent: total,
        topCategoryName: nameOf.get(topId) ?? null,
        topCategorySpent: topSpent,
      };
    });
  }, [availableMonths, transactions, categories]);

  const allTime = useMemo(() => {
    let total = 0;
    const byCategory = new Map<string, number>();
    for (const tx of transactions ?? []) {
      total += tx.amount;
      byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) ?? 0) + tx.amount);
    }
    let topId = "";
    let topSpent = 0;
    for (const [id, amount] of byCategory) {
      if (amount > topSpent) {
        topSpent = amount;
        topId = id;
      }
    }
    const monthsWithSpend = monthSummaries.filter((m) => m.totalSpent > 0).length;
    const nameOf = new Map((categories ?? []).map((c) => [c.clientId, c.name]));
    return {
      totalSpent: total,
      monthsTracked: monthsWithSpend,
      avgPerMonth: monthsWithSpend > 0 ? total / monthsWithSpend : 0,
      topCategoryName: nameOf.get(topId) ?? null,
      topCategorySpent: topSpent,
    };
  }, [transactions, monthSummaries, categories]);

  const monthTransactions = useMemo(
    () => (transactions ?? []).filter((t) => monthKeyOf(t.date) === viewMonthKey),
    [transactions, viewMonthKey],
  );

  const addCategory = useCallback(
    async (input: { name: string; color: string; monthlyLimit: number }) => {
      const created = await createBudgetCategory(input);
      return created.clientId;
    },
    [],
  );

  const updateCategory = useCallback(async (clientId: string, patch: Partial<LocalBudgetCategory>) => {
    // Edit isn't surfaced in the UI yet; keep a no-sync local modify so
    // existing callers (if any) don't break. Add a sync-engine update path
    // when an edit flow lands.
    await db.budgetCategories
      .where("clientId").equals(clientId)
      .modify({ ...patch, updatedAt: new Date().toISOString() });
  }, []);

  const deleteCategory = useCallback(async (clientId: string) => {
    await deleteBudgetCategory(clientId);
  }, []);

  const addTransaction = useCallback(
    async (input: { categoryId: string; amount: number; note?: string; date?: string }) => {
      await createBudgetTransaction({
        categoryId: input.categoryId,
        amount: input.amount,
        note: input.note,
        date: input.date ?? new Date().toISOString(),
      });
    },
    [],
  );

  const deleteTransaction = useCallback(async (clientId: string) => {
    await deleteBudgetTransaction(clientId);
  }, []);

  const setCategoryLimitForMonth = useCallback(
    async (categoryId: string, amount: number | null) => {
      await setBudgetCategoryOverride(categoryId, viewMonthKey, amount);
    },
    [viewMonthKey],
  );

  return {
    viewMonthKey,
    isCurrentMonth: viewMonthKey === getCurrentMonthKey(),
    availableMonths,
    monthSummaries,
    allTime,
    monthlyIncome,
    setMonthlyIncome,
    categories: categoriesWithTotals,
    transactions: transactions ?? [],
    monthTransactions,
    totalBudgeted,
    totalSpent,
    unallocated,
    incomeRemaining,
    addCategory,
    updateCategory,
    deleteCategory,
    addTransaction,
    deleteTransaction,
    setCategoryLimitForMonth,
    shiftMonth,
  };
}
