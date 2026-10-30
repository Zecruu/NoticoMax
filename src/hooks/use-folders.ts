"use client";

import { useState, useEffect, useCallback } from "react";
import { type LocalFolder } from "@/lib/db/indexed-db";
import {
  createFolder,
  updateFolder,
  deleteFolder,
  getFolders,
  subscribeSyncComplete,
} from "@/lib/sync/sync-engine";

export function useFolders() {
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
    const initial = window.setTimeout(() => { if (mounted) void refresh(); }, 0);

    // Register to refresh when sync brings in new server data
    // Each consumer owns its subscription; remount order cannot replace callbacks.
    const unsubscribeSync = subscribeSyncComplete(() => {
      if (mounted) refresh();
    });

    return () => {
      mounted = false;
      window.clearTimeout(initial);
      unsubscribeSync();
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
