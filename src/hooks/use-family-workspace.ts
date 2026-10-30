"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import type { FamilyWorkspace, WorkspaceCommand } from "@/lib/family/workspace";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { performSync } from "@/lib/sync/sync-engine";

/** Online per-entry commands, not whole-document/offline last-writer-wins writes. */
export function useFamilyWorkspace(householdId: string | null) {
  const [data, setData] = useState<FamilyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [fresh, setFresh] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const generation = useRef(0);
  const reads = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const account = useRef<string | null>(null);
  const active = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    if (!householdId || document.visibilityState === "hidden" || active.current.size) return;
    controller.current?.abort();
    const request = new AbortController(); controller.current = request;
    const scope = generation.current; const sequence = ++reads.current;
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; request.abort(); }, 20_000);
    try {
      const response = await fetch(`/api/households/${householdId}/workspace`, { cache: "no-store", credentials: "include", signal: request.signal });
      const result = await response.json();
      if (request.signal.aborted || scope !== generation.current || sequence !== reads.current) return;
      if (!response.ok) {
        if ([401, 403, 404].includes(response.status)) setData(null);
        throw new Error(result.error || "Family could not be refreshed.");
      }
      if (result.householdId !== householdId || !Array.isArray(result.lists) || !Array.isArray(result.places)) throw new Error("The refresh was incomplete. Try again.");
      account.current = result.userId; setData(result); setFresh(true); setError(null);
    } catch (problem) {
      if ((request.signal.aborted && !timedOut) || scope !== generation.current) return;
      setFresh(false); setError(timedOut ? "Family refresh timed out. Try again when connected." : problem instanceof Error ? problem.message : "Connect to refresh Family.");
    } finally { window.clearTimeout(timeout); if ((!request.signal.aborted || timedOut) && scope === generation.current) setLoading(false); }
  }, [householdId]);

  useEffect(() => {
    const scopeRef = generation;
    const activeRef = active;
    scopeRef.current++;
    const initial = window.setTimeout(() => { setData(null); setLoading(!!householdId); setFresh(false); setError(null); setPending(new Set()); void refresh(); }, 0);
    const visibility = () => { if (document.visibilityState === "visible") void refresh(); };
    const offline = () => { reads.current++; controller.current?.abort(); setFresh(false); setError("Offline. Saved content can be read here; reconnect before changing a list or place."); };
    document.addEventListener("visibilitychange", visibility); window.addEventListener("online", refresh); window.addEventListener("offline", offline);
    const interval = window.setInterval(() => void refresh(), 15_000);
    let unsubscribe: (() => void) | undefined;
    try {
      const { data: auth } = getSupabaseBrowserClient().auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
        const nextAccount = session?.user.id ?? null;
        if (event === "SIGNED_OUT" || (event === "SIGNED_IN" && account.current && account.current !== nextAccount)) {
          scopeRef.current++; reads.current++; controller.current?.abort(); activeRef.current.clear(); setPending(new Set()); setData(null); setFresh(false); setError("Refresh Family after signing in.");
        }
        if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "SIGNED_OUT") account.current = nextAccount;
      });
      unsubscribe = () => auth.subscription.unsubscribe();
    } catch { /* The API independently verifies authentication. */ }
    return () => { scopeRef.current++; controller.current?.abort(); activeRef.current.clear(); unsubscribe?.(); window.clearTimeout(initial); window.clearInterval(interval); document.removeEventListener("visibilitychange", visibility); window.removeEventListener("online", refresh); window.removeEventListener("offline", offline); };
  }, [householdId, refresh]);

  const mutate = useCallback(async (command: WorkspaceCommand, key: string): Promise<boolean> => {
    if (!householdId || data?.householdId !== householdId || !fresh || !navigator.onLine) throw new Error("Connect and refresh Family before saving this change.");
    if (active.current.has(key)) return false;
    const scope = generation.current;
    active.current.add(key); setPending(new Set(active.current)); reads.current++; controller.current?.abort();
    let problem: Error | null = null;
    const write = new AbortController();
    const timeout = window.setTimeout(() => write.abort(), 20_000);
    try {
      const response = await fetch(`/api/households/${householdId}/workspace`, { method: "POST", signal: write.signal, cache: "no-store", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Save could not be confirmed. Refresh before retrying.");
      if (scope !== generation.current) return false;
    } catch (error) { problem = write.signal.aborted ? new Error("Save timed out and may have reached the server. Refresh before retrying; your draft is kept open.") : error instanceof Error ? error : new Error("Save could not be confirmed. Your draft is kept open."); }
    finally { window.clearTimeout(timeout); if (scope === generation.current) { active.current.delete(key); setPending(new Set(active.current)); } }
    if (scope !== generation.current) return false;
    await refresh();
    if (problem) throw problem;
    void performSync();
    return true;
  }, [householdId, data?.householdId, fresh, refresh]);

  return { data: data?.householdId === householdId ? data : null, loading, fresh: fresh && data?.householdId === householdId, error, pending, refresh, mutate };
}
