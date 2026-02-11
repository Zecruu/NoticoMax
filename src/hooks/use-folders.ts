"use client";

import { useState, useEffect, useCallback } from "react";
import { type LocalFolder } from "@/lib/db/indexed-db";
import {
  createFolder,
  updateFolder,
  deleteFolder,
  getFolders,
  initialSync,
  setupSyncListeners,
  type SyncTier,
} from "@/lib/sync/sync-engine";

export function useFolders(tier: SyncTier = "anonymous") {
  const [folders, setFolders] = useState<LocalFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const result = await getFolders();
    setFolders(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function init() {
      await refresh();
      if (mounted && tier === "pro") {
        await initialSync();
        await refresh();
      }
    }

    setupSyncListeners();
    init();

    return () => {
      mounted = false;
    };
  }, [refresh, tier]);

  const addFolder = useCallback(
    async (folder: Omit<LocalFolder, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">) => {
      await createFolder(folder);
      await refresh();
    },
    [refresh]
  );

  const editFolder = useCallback(
    async (clientId: string, updates: Partial<LocalFolder>) => {
      await updateFolder(clientId, updates);
      await refresh();
    },
    [refresh]
  );

  const removeFolder = useCallback(
    async (clientId: string) => {
      await deleteFolder(clientId);
      await refresh();
    },
    [refresh]
  );

  return {
    folders,
    loading,
    addFolder,
    editFolder,
    removeFolder,
    refresh,
  };
}
