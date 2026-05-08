"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, {
  type LocalBudgetCategory,
  type LocalBudgetTransaction,
} from "@/lib/db/indexed-db";

const INCOME_KEY = "noticomax_budget_monthly_income";

export function getCurrentMonthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function isInCurrentMonth(iso: string): boolean {
  return iso.slice(0, 7) === getCurrentMonthKey();
}

export interface BudgetCategoryWithTotals extends LocalBudgetCategory {
  spentThisMonth: number;
  remaining: number;
  percent: number;
}

export function useBudget() {
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

  const categoriesWithTotals: BudgetCategoryWithTotals[] = (categories ?? []).map((cat) => {
    const spent = (transactions ?? [])
      .filter((t) => t.categoryId === cat.clientId && isInCurrentMonth(t.date))
      .reduce((sum, t) => sum + t.amount, 0);
    const remaining = cat.monthlyLimit - spent;
    const percent = cat.monthlyLimit > 0 ? (spent / cat.monthlyLimit) * 100 : 0;
    return { ...cat, spentThisMonth: spent, remaining, percent };
  });

  const totalBudgeted = categoriesWithTotals.reduce((s, c) => s + c.monthlyLimit, 0);
  const totalSpent = categoriesWithTotals.reduce((s, c) => s + c.spentThisMonth, 0);
  const unallocated = monthlyIncome - totalBudgeted;
  const incomeRemaining = monthlyIncome - totalSpent;

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
    monthlyIncome,
    setMonthlyIncome,
    categories: categoriesWithTotals,
    transactions: transactions ?? [],
    totalBudgeted,
    totalSpent,
    unallocated,
    incomeRemaining,
    addCategory,
    updateCategory,
    deleteCategory,
    addTransaction,
    deleteTransaction,
  };
}
