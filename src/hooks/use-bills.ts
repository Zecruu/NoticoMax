"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import db, { type LocalBill } from "@/lib/db/indexed-db";
import {
  createBudgetTransaction,
  deleteBudgetTransaction,
} from "@/lib/sync/sync-engine";

export interface UseBillsResult {
  bills: LocalBill[];
  unpaidBills: LocalBill[];
  paidBills: LocalBill[];
  addBill: (input: {
    name: string;
    amount: number;
    dueDate?: string;
    categoryId?: string;
  }) => Promise<string>;
  updateBill: (clientId: string, patch: Partial<LocalBill>) => Promise<void>;
  removeBill: (clientId: string) => Promise<void>;
  markPaid: (clientId: string, opts?: { categoryId?: string; date?: string }) => Promise<void>;
  unmarkPaid: (clientId: string) => Promise<void>;
}

export function useBills(): UseBillsResult {
  const bills = useLiveQuery(
    () => db.bills.toArray().then((b) => b.filter((x) => !x.deleted)),
    [],
    [] as LocalBill[],
  );

  const list = bills ?? [];
  // Soonest due first; undated bills go last; secondary sort by createdAt.
  const sorted = [...list].sort((a, b) => {
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.createdAt.localeCompare(b.createdAt);
  });
  const unpaidBills = sorted.filter((b) => !b.paid);
  const paidBills = sorted.filter((b) => b.paid);

  const addBill = useCallback(
    async (input: { name: string; amount: number; dueDate?: string; categoryId?: string }) => {
      const now = new Date().toISOString();
      const clientId = uuidv4();
      const bill: LocalBill = {
        clientId,
        name: input.name,
        amount: input.amount,
        dueDate: input.dueDate,
        categoryId: input.categoryId,
        paid: false,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      };
      await db.bills.add(bill);
      return clientId;
    },
    [],
  );

  const updateBill = useCallback(async (clientId: string, patch: Partial<LocalBill>) => {
    await db.bills
      .where("clientId").equals(clientId)
      .modify({ ...patch, updatedAt: new Date().toISOString() });
  }, []);

  const removeBill = useCallback(async (clientId: string) => {
    const now = new Date().toISOString();
    await db.bills
      .where("clientId").equals(clientId)
      .modify({ deleted: true, deletedAt: now, updatedAt: now });
  }, []);

  // Mark a bill paid: create a budget transaction in the Bills (or chosen)
  // category so it reflects in this month's spend, then stamp the bill with
  // paidTransactionId so we can undo cleanly via unmarkPaid below.
  const markPaid = useCallback(
    async (clientId: string, opts?: { categoryId?: string; date?: string }) => {
      const bill = await db.bills.where("clientId").equals(clientId).first();
      if (!bill || bill.paid) return;

      let categoryId = opts?.categoryId ?? bill.categoryId;
      if (!categoryId) {
        // Find or create a Bills category. Same name-match as the quick-add
        // bar in budget-view so they share the same bucket.
        const cats = await db.budgetCategories.toArray();
        const existing = cats.find(
          (c) => !c.deleted && c.name.toLowerCase() === "bills",
        );
        if (existing) {
          categoryId = existing.clientId;
        } else {
          const { createBudgetCategory } = await import("@/lib/sync/sync-engine");
          const created = await createBudgetCategory({
            name: "Bills",
            color: "#f97316",
            monthlyLimit: 0,
          });
          categoryId = created.clientId;
        }
      }

      const txDate = opts?.date ?? new Date().toISOString();
      const tx = await createBudgetTransaction({
        categoryId,
        amount: bill.amount,
        note: bill.name,
        date: txDate,
      });

      const now = new Date().toISOString();
      await db.bills.where("clientId").equals(clientId).modify({
        paid: true,
        paidAt: now,
        paidTransactionId: tx.clientId,
        categoryId,
        updatedAt: now,
      });
    },
    [],
  );

  // Undo Mark Paid — flips the bill back to unpaid and removes the budget
  // transaction the Mark Paid action created (if it still exists).
  const unmarkPaid = useCallback(async (clientId: string) => {
    const bill = await db.bills.where("clientId").equals(clientId).first();
    if (!bill || !bill.paid) return;
    if (bill.paidTransactionId) {
      try {
        await deleteBudgetTransaction(bill.paidTransactionId);
      } catch {
        /* tx may have been deleted already — ignore */
      }
    }
    const now = new Date().toISOString();
    await db.bills.where("clientId").equals(clientId).modify({
      paid: false,
      paidAt: undefined,
      paidTransactionId: undefined,
      updatedAt: now,
    });
  }, []);

  return {
    bills: sorted,
    unpaidBills,
    paidBills,
    addBill,
    updateBill,
    removeBill,
    markPaid,
    unmarkPaid,
  };
}
