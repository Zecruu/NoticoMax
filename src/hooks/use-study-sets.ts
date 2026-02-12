"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import db, { type LocalStudySet, type StudyCard } from "@/lib/db/indexed-db";

export function useStudySets() {
  const [studySets, setStudySets] = useState<LocalStudySet[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await db.studySets
      .where("deleted")
      .equals(0)
      .toArray();
    setStudySets(result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addStudySet = useCallback(
    async (data: { name: string; cards: StudyCard[] }) => {
      const now = new Date().toISOString();
      await db.studySets.add({
        clientId: uuidv4(),
        name: data.name,
        cards: data.cards,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await refresh();
    },
    [refresh]
  );

  const editStudySet = useCallback(
    async (clientId: string, updates: Partial<LocalStudySet>) => {
      const set = await db.studySets.where("clientId").equals(clientId).first();
      if (set?.id) {
        await db.studySets.update(set.id, {
          ...updates,
          updatedAt: new Date().toISOString(),
        });
      }
      await refresh();
    },
    [refresh]
  );

  const removeStudySet = useCallback(
    async (clientId: string) => {
      const set = await db.studySets.where("clientId").equals(clientId).first();
      if (set?.id) {
        await db.studySets.update(set.id, {
          deleted: true,
          deletedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      await refresh();
    },
    [refresh]
  );

  return {
    studySets,
    loading,
    addStudySet,
    editStudySet,
    removeStudySet,
    refresh,
  };
}
