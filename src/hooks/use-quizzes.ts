"use client";

import { useState, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import db, { type LocalQuiz, type QuizQuestion } from "@/lib/db/indexed-db";

export function useQuizzes() {
  const [quizzes, setQuizzes] = useState<LocalQuiz[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await db.quizzes
      .filter((q) => !q.deleted)
      .toArray();
    setQuizzes(result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addQuiz = useCallback(
    async (data: { name: string; questions: QuizQuestion[] }) => {
      const now = new Date().toISOString();
      await db.quizzes.add({
        clientId: uuidv4(),
        name: data.name,
        questions: data.questions,
        deleted: false,
        createdAt: now,
        updatedAt: now,
      });
      await refresh();
    },
    [refresh]
  );

  const editQuiz = useCallback(
    async (clientId: string, updates: Partial<LocalQuiz>) => {
      const quiz = await db.quizzes.where("clientId").equals(clientId).first();
      if (quiz?.id) {
        await db.quizzes.update(quiz.id, {
          ...updates,
          updatedAt: new Date().toISOString(),
        });
      }
      await refresh();
    },
    [refresh]
  );

  const removeQuiz = useCallback(
    async (clientId: string) => {
      const quiz = await db.quizzes.where("clientId").equals(clientId).first();
      if (quiz?.id) {
        await db.quizzes.update(quiz.id, {
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
    quizzes,
    loading,
    addQuiz,
    editQuiz,
    removeQuiz,
    refresh,
  };
}
