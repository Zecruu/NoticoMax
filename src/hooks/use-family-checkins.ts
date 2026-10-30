"use client";

import type { AuthChangeEvent } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentCoords } from "@/lib/geolocation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface FamilyCheckin {
  userId: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  capturedAt: string;
  sharedAt: string;
  expiresAt: string;
}

interface Snapshot {
  householdId: string;
  userId: string;
  sharingEnabled: boolean;
  checkins: FamilyCheckin[];
}

type Action = "enable" | "pause" | "capture" | "delete";

/** Check-ins deliberately never enter the offline database or sync queue. */
export function useFamilyCheckins(householdId: string) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const scope = useRef(0);
  const command = useRef(0);
  const activeAction = useRef<Action | null>(null);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!householdId || document.visibilityState === "hidden") return;
    // Do not let a read started before a mutation restore stale consent/data.
    if (activeAction.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const generation = scope.current;
    const operation = command.current;
    try {
      const res = await fetch(`/api/households/${encodeURIComponent(householdId)}/checkins`, {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted || scope.current !== generation || command.current !== operation) return;
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || res.status === 404) {
          setSnapshot(null);
          command.current++;
        }
        throw new Error(data.error || "Check-ins are unavailable. Please refresh.");
      }
      setSnapshot({
        householdId,
        userId: data.userId,
        sharingEnabled: data.sharingEnabled === true,
        checkins: (data.checkins as FamilyCheckin[]).filter((row) => Date.parse(row.expiresAt) > Date.now()),
      });
      setReady(true);
      setError(null);
    } catch (err) {
      if (controller.signal.aborted || scope.current !== generation) return;
      // Fail closed: don't keep displaying coordinates after losing access/network.
      setSnapshot((previous) => previous ? { ...previous, checkins: [] } : null);
      setReady(false);
      setError(err instanceof Error ? err.message : "Couldn't refresh check-ins.");
    } finally {
      if (!controller.signal.aborted && scope.current === generation) setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    const scopeRef = scope;
    const commandRef = command;
    scopeRef.current++;
    const reset = () => {
      command.current++;
      request.current?.abort();
      mutation.current?.abort();
      activeAction.current = null;
      setSnapshot(null);
      setReady(false);
      setPending(null);
      setNotice(null);
      setError(null);
      setLoading(true);
    };
    // Keep state updates in the asynchronous task, including Strict Mode remounts.
    const initial = window.setTimeout(() => { reset(); void refresh(); }, 0);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
      else {
        // Leaving the visible screen cancels an unfinished OS capture.
        // Aborting a sent request is not proof of server revocation.
        if (activeAction.current === "capture") {
          command.current++;
          mutation.current?.abort();
          activeAction.current = null;
          setPending(null);
          setNotice("Capture interrupted. Refresh to check whether a sent check-in was saved; pause sharing to revoke it.");
        }
        request.current?.abort();
        setSnapshot((previous) => previous ? { ...previous, checkins: [] } : null);
        setReady(false);
      }
    };
    const timer = window.setInterval(() => void refresh(), 30_000);
    const onOffline = () => {
      command.current++;
      request.current?.abort();
      mutation.current?.abort();
      activeAction.current = null;
      setPending(null);
      setSnapshot((previous) => previous ? { ...previous, checkins: [] } : null);
      setReady(false);
      setError("You are offline. A check-in already sent may remain visible until expiry. Reconnect to refresh or pause sharing.");
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", refresh);
    let unsubscribe: (() => void) | undefined;
    try {
      const { data } = getSupabaseBrowserClient().auth.onAuthStateChange((event: AuthChangeEvent) => {
        if (event === "SIGNED_OUT" || event === "SIGNED_IN") {
          scope.current++;
          reset();
          if (event === "SIGNED_OUT") {
            setLoading(false);
            setError("Sign in to view family check-ins.");
          } else {
            // Never make authenticated fetches inside Supabase's auth callback.
            window.setTimeout(() => void refresh(), 0);
          }
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();
    } catch { /* API reports missing/expired authentication independently. */ }
    return () => {
      scopeRef.current++;
      commandRef.current++;
      activeAction.current = null;
      request.current?.abort();
      mutation.current?.abort();
      window.clearTimeout(initial);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", refresh);
      unsubscribe?.();
    };
  }, [refresh]);

  // Hide a check-in at its exact expiry, not up to a polling interval later.
  useEffect(() => {
    const times = snapshot?.checkins.map((row) => Date.parse(row.expiresAt)) ?? [];
    if (!times.length) return;
    const timer = window.setTimeout(() => {
      setSnapshot((previous) => previous ? { ...previous,
        checkins: previous.checkins.filter((row) => Date.parse(row.expiresAt) > Date.now()),
      } : null);
    }, Math.max(0, Math.min(...times) - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [snapshot]);

  const run = useCallback(async (action: Action) => {
    // Pause may interrupt an in-flight geolocation or share; all other repeated
    // taps are ignored. The server serializes consent/check-in writes too.
    if (activeAction.current && !(action === "pause" && activeAction.current === "capture")) return;
    if ((action === "capture" || action === "enable") && !ready) return;
    if (action === "capture" && !snapshot?.sharingEnabled) return;
    const generation = scope.current;
    const operation = ++command.current;
    const current = () => generation === scope.current && operation === command.current;
    activeAction.current = action;
    request.current?.abort();
    mutation.current?.abort();
    const controller = new AbortController();
    mutation.current = controller;
    setPending(action);
    setError(null);
    setNotice(null);
    try {
      let method: string;
      let body: string | undefined;
      if (action === "capture") {
        if (!navigator.onLine) throw new Error("Connect to the internet to share a check-in. Locations are never queued offline.");
        const coords = await getCurrentCoords();
        if (!current() || document.visibilityState === "hidden") return; // Cancel/leave/pause while the OS prompt was open.
        method = "POST";
        body = JSON.stringify(coords);
      } else if (action === "delete") {
        method = "DELETE";
      } else {
        method = "PATCH";
        body = JSON.stringify({ enabled: action === "enable" });
      }
      const res = await fetch(`/api/households/${encodeURIComponent(householdId)}/checkins`, {
        method,
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!current()) return;
      if (!res.ok) throw new Error(data.error || "Couldn't save the change. Please try again.");
      if (action === "pause" || action === "delete") {
        setSnapshot((previous) => previous ? {
          ...previous,
          sharingEnabled: action === "pause" ? false : previous.sharingEnabled,
          checkins: previous.checkins.filter((row) => row.userId !== previous.userId),
        } : null);
      }
      setNotice(action === "capture" ? "Check-in shared. It expires within 24 hours."
        : action === "pause" ? "Sharing paused and your check-in deleted."
        : action === "delete" ? "Your check-in was deleted."
        : "Manual check-ins enabled. Your location has not been shared.");
    } catch (err) {
      if (!current() || controller.signal.aborted) return;
      const detail = err instanceof Error ? err.message : "Please try again.";
      setError(action === "pause"
        ? `Pause could not be confirmed. Your last check-in may still be visible until it expires. Retry when connected. ${detail}`
        : detail);
      // No automatic retries of location writes: a later location needs a new tap.
      return;
    } finally {
      if (current()) {
        activeAction.current = null;
        setPending(null);
      }
    }
    if (current()) await refresh();
  }, [householdId, ready, snapshot?.sharingEnabled, refresh]);

  const currentSnapshot = snapshot?.householdId === householdId ? snapshot : null;
  return {
    userId: currentSnapshot?.userId ?? null,
    sharingEnabled: currentSnapshot?.sharingEnabled ?? false,
    checkins: currentSnapshot?.checkins ?? [],
    loading,
    ready: ready && !!currentSnapshot,
    error,
    notice,
    pending,
    refresh,
    enable: () => run("enable"),
    pause: () => run("pause"),
    share: () => run("capture"),
    remove: () => run("delete"),
  };
}
