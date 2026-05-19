"use client";

import { useCallback, useEffect, useState } from "react";
import { performSync } from "@/lib/sync/sync-engine";

export interface HouseholdMember {
  userId: string;
  email: string | null;
  role: "owner" | "member";
  joinedAt: string;
}

export interface PendingRequest {
  token: string;
  userId: string;
  email: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface Household {
  id: string;
  name: string;
  ownerUserId: string;
  createdAt: string;
  familyCode: string;
  maxSeats: number;
  currentSeats: number;
  subscriptionPlan: "free" | "family" | "family_plus";
  role: "owner" | "member";
  members: HouseholdMember[];
  /** Empty array for non-owners. */
  pendingRequests: PendingRequest[];
}

/** Pending email invite addressed TO the current user (Ship 1a path). */
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
  /** Request to join a household by family code (member-initiated). */
  requestByCode: (
    code: string,
  ) => Promise<
    | {
        success: true;
        alreadyMember?: boolean;
        pending?: boolean;
        householdName: string;
      }
    | { success: false; error: string }
  >;
  /** Owner approves or declines a member's join request. */
  approveRequest: (
    token: string,
    action: "approve" | "decline",
  ) => Promise<{ success: true } | { success: false; error: string }>;
  /** Ship 1a email-invite response (kept so any in-flight email invites still work). */
  respond: (
    token: string,
    action: "accept" | "decline",
  ) => Promise<{ success: true } | { success: false; error: string }>;
  leave: (
    householdId: string,
    deleteIfOwner?: boolean,
  ) => Promise<{ success: true } | { success: false; error: string }>;
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
        setHouseholds([]);
        setPendingInvites([]);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHouseholds(data.households ?? []);
      setPendingInvites(data.pendingInvites ?? []);
      // Also trigger a sync so any auto-created family folder lands in
      // IndexedDB right after a household appears/changes. Cheap when nothing
      // changed; essential after the first household create.
      void performSync();
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
      // The server creates a default folder for the new household. Pull it
      // into IndexedDB now so the user sees it immediately — otherwise it'd
      // wait for realtime or the next visibility-change sync.
      void performSync();
      return { success: true as const };
    },
    [refresh],
  );

  const requestByCode = useCallback(
    async (code: string) => {
      const res = await fetch("/api/households/by-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false as const, error: data.error || "Failed to request" };
      await refresh();
      // If they were already a member (no-op success), pull shared content
      // so the family folder + items show up on this device too.
      if (data.alreadyMember) void performSync();
      return {
        success: true as const,
        alreadyMember: !!data.alreadyMember,
        pending: !!data.pending,
        householdName: data.householdName as string,
      };
    },
    [refresh],
  );

  const approveRequest = useCallback(
    async (token: string, action: "approve" | "decline") => {
      const res = await fetch("/api/households/approve-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false as const, error: data.error || "Failed to update request" };
      await refresh();
      // After approving, the new member's next visibility-change sync pulls
      // shared content. On this admin device there's nothing new to pull,
      // but trigger anyway in case other state changed.
      void performSync();
      return { success: true as const };
    },
    [refresh],
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
    requestByCode,
    approveRequest,
    respond,
    leave,
  };
}
