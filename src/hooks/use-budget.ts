"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, {
  type LocalBudgetCategory,
  type LocalBudgetTransaction,
} from "@/lib/db/indexed-db";

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

/** Returns prior YYYY-MM string. */
function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return getCurrentMonthKey(d);
}

export interface BudgetCategoryWithTotals extends LocalBudgetCategory {
  spentInMonth: number;
  remaining: number;
  percent: number;
  /** Backwards-compat alias for old call sites. */
  spentThisMonth: number;
}

export interface MonthSummary {
  monthKey: string;
  totalSpent: number;
  topCategoryName: string | null;
  topCategorySpent: number;
}

export function useBudget(viewMonthKey: string = getCurrentMonthKey()) {
  const [monthlyIncome, setMonthlyIncomeState] = useState<number>(0);

  useEffect(() => {
    const stored = localStorage.getItem(INCOME_KEY);
    if (stored) {
      const n = Number(stored);
      if (!Number.isNaN(n)) setMonthlyIncomeState(n);
    }
  }, []);

  const setMonthlyIncome = useCallback((amount: number) => {
    setMonthlyIncomeState(amount);
    localStorage.setItem(INCOME_KEY, String(amount));
  }, []);

  const categories = useLiveQuery(
    () => db.budgetCategories.toArray().then((r) => r.filter((c) => !c.deleted)),
    [],
    [] as LocalBudgetCategory[],
  );

  const transactions = useLiveQuery(
    () => db.budgetTransactions.toArray(),
    [],
    [] as LocalBudgetTransaction[],
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
    const remaining = cat.monthlyLimit - spent;
    const percent = cat.monthlyLimit > 0 ? (spent / cat.monthlyLimit) * 100 : 0;
    return { ...cat, spentInMonth: spent, spentThisMonth: spent, remaining, percent };
  });

  const totalBudgeted = categoriesWithTotals.reduce((s, c) => s + c.monthlyLimit, 0);
  const totalSpent = categoriesWithTotals.reduce((s, c) => s + c.spentInMonth, 0);
  const unallocated = monthlyIncome - totalBudgeted;
  const incomeRemaining = monthlyIncome - totalSpent;

  /** Every month that has at least one transaction, newest first, plus the current month. */
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    set.add(getCurrentMonthKey());
    for (const tx of transactions ?? []) set.add(monthKeyOf(tx.date));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  /** Per-month rollup: spent + top-spending category. */
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

  /** All-time stats across every transaction we've ever logged. */
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

  const addCategory = useCallback(async (input: { name: string; color: string; monthlyLimit: number }) => {
    const now = new Date().toISOString();
    const cat: LocalBudgetCategory = {
      clientId: crypto.randomUUID(),
      name: input.name,
      color: input.color,
      monthlyLimit: input.monthlyLimit,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    await db.budgetCategories.add(cat);
  }, []);

  const updateCategory = useCallback(async (clientId: string, patch: Partial<LocalBudgetCategory>) => {
    await db.budgetCategories
      .where("clientId").equals(clientId)
      .modify({ ...patch, updatedAt: new Date().toISOString() });
  }, []);

  const deleteCategory = useCallback(async (clientId: string) => {
    await db.budgetCategories.where("clientId").equals(clientId).delete();
    await db.budgetTransactions.where("categoryId").equals(clientId).delete();
  }, []);

  const addTransaction = useCallback(async (input: { categoryId: string; amount: number; note?: string }) => {
    const now = new Date().toISOString();
    const tx: LocalBudgetTransaction = {
      clientId: crypto.randomUUID(),
      categoryId: input.categoryId,
      amount: input.amount,
      note: input.note,
      date: now,
      createdAt: now,
    };
    await db.budgetTransactions.add(tx);
  }, []);

  const deleteTransaction = useCallback(async (clientId: string) => {
    await db.budgetTransactions.where("clientId").equals(clientId).delete();
  }, []);

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
    shiftMonth,
  };
}
