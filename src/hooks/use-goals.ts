"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, { type LocalGoal, type GoalScope } from "@/lib/db/indexed-db";

export function getPeriodKey(scope: GoalScope, d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (scope === "today") return `${y}-${m}-${day}`;
  if (scope === "month") return `${y}-${m}`;
  return String(y);
}

export function formatPeriodKey(scope: GoalScope, periodKey: string): string {
  if (scope === "today") {
    const [y, m, d] = periodKey.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric",
    });
  }
  if (scope === "month") {
    const [y, m] = periodKey.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
      month: "long", year: "numeric",
    });
  }
  return periodKey;
}

export function useGoals() {
  const goals = useLiveQuery(
    () => db.goals.toArray().then((rows) => rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
    [] as LocalGoal[],
  );

  const addGoal = useCallback(async (input: { title: string; scope: GoalScope }) => {
    const now = new Date().toISOString();
    const goal: LocalGoal = {
      clientId: crypto.randomUUID(),
      title: input.title,
      scope: input.scope,
      periodKey: getPeriodKey(input.scope),
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.goals.add(goal);
  }, []);

  const toggleGoal = useCallback(async (clientId: string, completed: boolean) => {
    const now = new Date().toISOString();
    await db.goals
      .where("clientId").equals(clientId)
      .modify({
        completed: !completed,
        completedAt: !completed ? now : undefined,
        updatedAt: now,
      });
  }, []);

  const deleteGoal = useCallback(async (clientId: string) => {
    await db.goals.where("clientId").equals(clientId).delete();
  }, []);

  return {
    goals: goals ?? [],
    addGoal,
    toggleGoal,
    deleteGoal,
  };
}
