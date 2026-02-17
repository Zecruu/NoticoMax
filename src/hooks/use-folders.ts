"use client";

import { useState, useEffect, useCallback } from "react";
import { type LocalFolder } from "@/lib/db/indexed-db";
import {
  createFolder,
  updateFolder,
  deleteFolder,
  getFolders,
  setOnSyncComplete,
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

  // Refresh folders when background sync completes (handled by useItems)
  useEffect(() => {
    let mounted = true;

    // Load local folders immediately
    refresh();

    // Register to refresh when sync brings in new server data
    const prevCallback = setOnSyncComplete(() => {
      if (mounted) refresh();
    });

    return () => {
      mounted = false;
      // Restore previous callback (from useItems)
      setOnSyncComplete(prevCallback);
    };
  }, [refresh]);

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
