"use client";

import { useState, useEffect, useCallback } from "react";
import { type LocalFolder } from "@/lib/db/indexed-db";
import {
  createFolder,
  updateFolder,
  deleteFolder,
  ensureDefaultNotesFolder,
  getFolders,
  setOnSyncComplete,
} from "@/lib/sync/sync-engine";

export function useFolders(syncEnabledFlag: boolean = false) {
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

    // Local-only users need a usable Notes destination immediately. Synced
    // users wait for initialSync to pull any existing server-side Default first.
    void (async () => {
      if (!syncEnabledFlag) await ensureDefaultNotesFolder();
      if (mounted) await refresh();
    })();

    // Register to refresh when sync brings in new server data
    // Chain with the previous callback (from useItems) so both refresh
    const prevCallback = setOnSyncComplete(() => {
      void (async () => {
        await ensureDefaultNotesFolder();
        if (mounted) await refresh();
        if (prevCallback) prevCallback();
      })();
    });

    return () => {
      mounted = false;
      // Restore previous callback (from useItems)
      setOnSyncComplete(prevCallback);
    };
  }, [refresh, syncEnabledFlag]);

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
      await ensureDefaultNotesFolder();
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
