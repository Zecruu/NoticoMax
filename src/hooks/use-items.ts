"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { type LocalItem } from "@/lib/db/indexed-db";
import {
  createItem,
  updateItem,
  deleteItem,
  getItems,
  getDeletedItems,
  restoreItem as restoreItemEngine,
  permanentlyDeleteItem as permDeleteEngine,
  purgeOldTrash,
  initialSync,
  setupSyncListeners,
  setOnSyncError,
  performSync,
  setSyncContext,
  subscribeSyncComplete,
} from "@/lib/sync/sync-engine";
import { toast } from "@/lib/native-toast";
import { filterLibraryItems } from "@/lib/items/library";

export function useItems(
  typeFilter?: string,
  searchQuery?: string,
  folderFilter?: string | null,
  syncEnabledFlag: boolean = false,
  familyUserId: string | null = null
) {
  const [allItems, setAllItems] = useState<LocalItem[]>([]);
  const [trashedItems, setTrashedItems] = useState<LocalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const items = useMemo(
    () => filterLibraryItems(allItems, typeFilter, searchQuery, folderFilter),
    [allItems, typeFilter, searchQuery, folderFilter]
  );
  const requestRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSyncContext(syncEnabledFlag, familyUserId);
  }, [syncEnabledFlag, familyUserId]);

  const refresh = useCallback(async () => {
    const request = ++requestRef.current;
    const [result, deleted] = await Promise.all([
      getItems(),
      getDeletedItems(),
    ]);
    if (!mountedRef.current || request !== requestRef.current) return;
    setAllItems(result);
    setTrashedItems(deleted);
    setLoading(false);
  }, []);

  // Initial load + sync
  useEffect(() => {
    let mounted = true;

    async function init() {
      // Purge items trashed more than 30 days ago
      await purgeOldTrash();

      // Load from IndexedDB first (instant)
      await refresh();

      // Then sync with server (only for activated users)
      if (mounted && (syncEnabledFlag || familyUserId)) {
        setSyncing(true);
        try {
          await initialSync();
          if (mounted) await refresh();
        } finally {
          if (mounted) setSyncing(false);
        }
      }
    }

    // Register callback so background syncs (polling, online, visibility)
    // automatically refresh the UI
    const unsubscribeSync = subscribeSyncComplete(() => {
      if (mounted) refresh();
    });

    // Surface sync errors to the user
    setOnSyncError((error) => {
      console.error("[sync]", error);
      toast.error(`Sync failed: ${error}`);
    });

    const cleanupListeners = setupSyncListeners();
    void init().catch((error) => {
      if (mounted) {
        setLoading(false);
        console.error("[items]", error);
        toast.error(
          "Couldn't refresh your library. Your saved items are kept on this device."
        );
      }
    });

    return () => {
      mounted = false;
      unsubscribeSync();
      setOnSyncError(null);
      cleanupListeners();
    };
  }, [refresh, syncEnabledFlag, familyUserId]);

  const addItem = useCallback(
    async (
      item: Omit<
        LocalItem,
        "id" | "clientId" | "createdAt" | "updatedAt" | "deleted"
      >
    ) => {
      await createItem(item);
      await refresh();
    },
    [refresh]
  );

  const editItem = useCallback(
    async (clientId: string, updates: Partial<LocalItem>) => {
      await updateItem(clientId, updates);
      await refresh();
    },
    [refresh]
  );

  const removeItem = useCallback(
    async (clientId: string) => {
      await deleteItem(clientId);
      await refresh();
    },
    [refresh]
  );

  const togglePin = useCallback(
    async (clientId: string, currentPinned: boolean) => {
      await updateItem(clientId, { pinned: !currentPinned });
      await refresh();
    },
    [refresh]
  );

  const restoreItem = useCallback(
    async (clientId: string) => {
      await restoreItemEngine(clientId);
      await refresh();
    },
    [refresh]
  );

  const permanentlyDeleteItem = useCallback(
    async (clientId: string) => {
      await permDeleteEngine(clientId);
      await refresh();
    },
    [refresh]
  );

  const syncNow = useCallback(async () => {
    if (!syncEnabledFlag && !familyUserId) return;
    setSyncing(true);
    await performSync();
    await refresh();
    setSyncing(false);
  }, [refresh, syncEnabledFlag, familyUserId]);

  return {
    items,
    allItems,
    trashedItems,
    loading,
    syncing,
    addItem,
    editItem,
    removeItem,
    togglePin,
    restoreItem,
    permanentlyDeleteItem,
    syncNow,
    refresh,
  };
}
