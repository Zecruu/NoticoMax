"use client";

import { useCallback, useEffect, useState } from "react";

export interface HouseholdMember {
  userId: string;
  email: string | null;
  role: "owner" | "member";
  joinedAt: string;
}

export interface Household {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  role: "owner" | "member";
  members: HouseholdMember[];
}

export interface PendingInvite {
  token: string;
  householdId: string;
  householdName: string;
  invitedByEmail: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface UseHouseholdsResult {
  households: Household[];
  pendingInvites: PendingInvite[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createHousehold: (name: string) => Promise<{ success: true } | { success: false; error: string }>;
  invite: (householdId: string, email: string) => Promise<{ success: true } | { success: false; error: string }>;
  respond: (token: string, action: "accept" | "decline") => Promise<{ success: true } | { success: false; error: string }>;
  leave: (householdId: string, deleteIfOwner?: boolean) => Promise<{ success: true } | { success: false; error: string }>;
}

export function useHouseholds(): UseHouseholdsResult {
  const [households, setHouseholds] = useState<Household[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/households", { credentials: "include" });
      if (res.status === 401) {
        // Not logged in — show empty state, no error toast
        setHouseholds([]);
        setPendingInvites([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHouseholds(data.households ?? []);
      setPendingInvites(data.pendingInvites ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load households");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createHousehold = useCallback(
    async (name: string) => {
      const res = await fetch("/api/households", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false as const, error: data.error || "Failed to create" };
      await refresh();
      return { success: true as const };
    },
    [refresh],
  );

  const invite = useCallback(
    async (householdId: string, email: string) => {
      const res = await fetch("/api/households/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ householdId, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false as const, error: data.error || "Failed to invite" };
      return { success: true as const };
    },
    [],
  );

  const respond = useCallback(
    async (token: string, action: "accept" | "decline") => {
      const res = await fetch("/api/households/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false as const, error: data.error || "Failed to respond" };
      await refresh();
      return { success: true as const };
    },
    [refresh],
  );

  const leave = useCallback(
    async (householdId: string, deleteIfOwner = false) => {
      const res = await fetch("/api/households/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ householdId, deleteIfOwner }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false as const, error: data.error || "Failed to leave" };
      await refresh();
      return { success: true as const };
    },
    [refresh],
  );

  return {
    households,
    pendingInvites,
    loading,
    error,
    refresh,
    createHousehold,
    invite,
    respond,
    leave,
  };
}
