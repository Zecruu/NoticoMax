"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, { type LocalGoal, type GoalScope } from "@/lib/db/indexed-db";
import {
  createGoal as createGoalSynced,
  toggleGoal as toggleGoalSynced,
  deleteGoal as deleteGoalSynced,
} from "@/lib/sync/sync-engine";

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
    () => db.goals
      .toArray()
      .then((rows) => rows.filter((g) => !g.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
    [],
    [] as LocalGoal[],
  );

  const addGoal = useCallback(async (input: { title: string; scope: GoalScope }) => {
    await createGoalSynced({
      title: input.title,
      scope: input.scope,
      periodKey: getPeriodKey(input.scope),
    });
  }, []);

  const toggleGoal = useCallback(async (clientId: string, completed: boolean) => {
    await toggleGoalSynced(clientId, completed);
  }, []);

  const deleteGoal = useCallback(async (clientId: string) => {
    await deleteGoalSynced(clientId);
  }, []);

  return {
    goals: goals ?? [],
    addGoal,
    toggleGoal,
    deleteGoal,
  };
}
