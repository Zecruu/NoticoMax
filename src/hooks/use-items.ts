"use client";

import { useState, useEffect, useCallback } from "react";
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
  setOnSyncComplete,
  setOnSyncError,
  performSync,
  setSyncEnabled,
} from "@/lib/sync/sync-engine";
import { toast } from "@/lib/native-toast";

export function useItems(
  typeFilter?: string,
  searchQuery?: string,
  folderFilter?: string | null,
  syncEnabledFlag: boolean = false
) {
  const [items, setItems] = useState<LocalItem[]>([]);
  const [trashedItems, setTrashedItems] = useState<LocalItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setSyncEnabled(syncEnabledFlag);
  }, [syncEnabledFlag]);

  const refresh = useCallback(async () => {
    const result = await getItems(typeFilter, searchQuery, folderFilter);
    setItems(result);
    const deleted = await getDeletedItems();
    setTrashedItems(deleted);
    setLoading(false);
  }, [typeFilter, searchQuery, folderFilter]);

  // Initial load + sync
  useEffect(() => {
    let mounted = true;

    async function init() {
      // Purge items trashed more than 30 days ago
      await purgeOldTrash();

      // Load from IndexedDB first (instant)
      await refresh();

      // Then sync with server (only for activated users)
      if (mounted && syncEnabledFlag) {
        setSyncing(true);
        await initialSync();
        if (mounted) await refresh();
        setSyncing(false);
      }
    }

    // Register callback so background syncs (polling, online, visibility)
    // automatically refresh the UI
    setOnSyncComplete(() => {
      if (mounted) refresh();
    });

    // Surface sync errors to the user
    setOnSyncError((error) => {
      console.error("[sync]", error);
      toast.error(`Sync failed: ${error}`);
    });

    const cleanupListeners = setupSyncListeners();
    init();

    return () => {
      mounted = false;
      setOnSyncComplete(null);
      setOnSyncError(null);
      cleanupListeners();
    };
  }, [refresh, syncEnabledFlag]);

  const addItem = useCallback(
    async (item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">) => {
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
    if (!syncEnabledFlag) return;
    setSyncing(true);
    await performSync();
    await refresh();
    setSyncing(false);
  }, [refresh, syncEnabledFlag]);

  return {
    items,
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
