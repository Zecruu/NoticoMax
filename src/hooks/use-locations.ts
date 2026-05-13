"use client";

import { useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, { type LocalLocation } from "@/lib/db/indexed-db";
import {
  createLocation,
  updateLocation,
  deleteLocation,
} from "@/lib/sync/sync-engine";

export function useLocations(searchQuery?: string) {
  const locations = useLiveQuery(
    async () => {
      const rows = await db.locations.toArray();
      let filtered = rows.filter((l) => !l.deleted);
      if (searchQuery) {
        const terms = searchQuery.toLowerCase().split(/\s+/);
        filtered = filtered.filter((l) => {
          const searchable = `${l.name} ${l.address ?? ""} ${l.notes ?? ""} ${l.tags.join(" ")}`.toLowerCase();
          return terms.every((t) => searchable.includes(t));
        });
      }
      filtered.sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      return filtered;
    },
    [searchQuery],
    [] as LocalLocation[],
  );

  const addLocation = useCallback(
    (loc: Omit<LocalLocation, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">) =>
      createLocation(loc),
    [],
  );

  const editLocation = useCallback(
    (clientId: string, updates: Partial<LocalLocation>) => updateLocation(clientId, updates),
    [],
  );

  const removeLocation = useCallback((clientId: string) => deleteLocation(clientId), []);

  const togglePin = useCallback(
    (clientId: string, pinned: boolean) => updateLocation(clientId, { pinned: !pinned }),
    [],
  );

  return {
    locations: locations ?? [],
    addLocation,
    editLocation,
    removeLocation,
    togglePin,
  };
}
