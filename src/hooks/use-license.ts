"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type StoragePlan =
  | "free"
  | "personal_5gb"
  | "personal_50gb"
  | "personal_200gb"
  | "family_20gb"
  | "family_100gb"
  | "family_500gb";

export interface ComputedEntitlements {
  proActive: boolean;
  syncEnabled: boolean;
  adsRemoved: boolean;
  source?: string | null;
  expiresAt?: string | null;
  lifetimePro?: boolean;
  /** True when the user has an active Family Plan subscription. Required to create a household. */
  familyPlanActive?: boolean;
  /** Number of extra seats the user has purchased (each adds 1 to a household's max_seats). */
  extraSeats?: number;
  /** Active storage tier. Defaults to "free" (100 MB included with Pro). */
  storagePlan?: StoragePlan;
  /** Bytes consumed (updated by the file-upload service; placeholder until that ships). */
  storageBytesUsed?: number;
}

const FREE_ENTITLEMENTS: ComputedEntitlements = {
  proActive: false,
  syncEnabled: false,
  adsRemoved: false,
  familyPlanActive: false,
  extraSeats: 0,
  storagePlan: "free",
  storageBytesUsed: 0,
};

const ENTITLEMENTS_KEY = "noticomax_entitlements";
const LAST_USER_KEY = "noticomax_user_id";

/**
 * IndexedDB lives at the device level — not per-user — so when a different
 * user signs in we have to wipe local notes/folders/etc. or the new user
 * sees the previous user's data.
 *
 * The previous user's id is kept across logout (intentionally, as the
 * "last user" marker) so that a fresh login as a different user still
 * triggers the wipe.
 */
async function wipeIfUserChanged(newUserId: string): Promise<void> {
  const prev = localStorage.getItem(LAST_USER_KEY);
  if (prev && prev !== newUserId) {
    try {
      const { wipeLocalDB } = await import("@/lib/db/indexed-db");
      await wipeLocalDB();
    } catch (err) {
      console.warn("[use-license] wipeLocalDB failed:", err);
    }
  }
  localStorage.setItem(LAST_USER_KEY, newUserId);
}

interface MeResponse {
  authenticated: boolean;
  userId?: string;
  email?: string | null;
  entitlements?: ComputedEntitlements;
}

type FetchMeResult =
  | { kind: "ok"; data: MeResponse }
  | { kind: "unauthenticated" } // server says no — really log them out
  | { kind: "network-error" }; // offline / timeout — keep cached state

async function fetchMe(): Promise<FetchMeResult> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.status === 401) return { kind: "unauthenticated" };
    if (!res.ok) return { kind: "network-error" };
    return { kind: "ok", data: (await res.json()) as MeResponse };
  } catch {
    // Network failure (DNS, offline, timeout). Do NOT interpret as logged out.
    return { kind: "network-error" };
  }
}

export function useLicense() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [entitlements, setEntitlements] = useState<ComputedEntitlements>(FREE_ENTITLEMENTS);

  // Refresh state. Order matters for offline support:
  //   1. Check the locally-cached Supabase session first. If we have one,
  //      the user IS logged in for UI purposes even with no network — they
  //      can read/edit everything in IndexedDB, and sync will resume when
  //      the network comes back.
  //   2. Try /api/auth/me ONLY if online. Use the result to refresh
  //      entitlements. A 401 means the session is genuinely revoked → log
  //      out. A network error means offline → keep the cached state.
  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data: { session } } = await supabase.auth.getSession();

    // No local session at all → unambiguously logged out.
    if (!session) {
      setUserId(null);
      setEmail(null);
      setIsLoggedIn(false);
      setEntitlements(FREE_ENTITLEMENTS);
      try { localStorage.removeItem(ENTITLEMENTS_KEY); } catch {}
      import("@/lib/iap/revenuecat-client")
        .then(({ resetIAPUser }) => resetIAPUser())
        .catch(() => { /* iap optional */ });
      return;
    }

    // We have a local session. Seed UI from it + cached entitlements right
    // away so the app is usable instantly, even if /api/auth/me hangs or
    // there's no network.
    const cachedUserId = session.user.id;
    const cachedEmail = session.user.email ?? null;
    await wipeIfUserChanged(cachedUserId);
    setUserId(cachedUserId);
    setEmail(cachedEmail);
    setIsLoggedIn(true);

    let cachedEntitlements: ComputedEntitlements = FREE_ENTITLEMENTS;
    try {
      const raw = localStorage.getItem(ENTITLEMENTS_KEY);
      if (raw) cachedEntitlements = JSON.parse(raw) as ComputedEntitlements;
    } catch {}
    setEntitlements(cachedEntitlements);

    import("@/lib/iap/revenuecat-client")
      .then(({ identifyIAPUser }) => identifyIAPUser(cachedUserId))
      .catch(() => { /* iap optional */ });

    // Skip the server hit when we know we're offline.
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    // Try to refresh from the server. Different outcomes:
    //   ok: update entitlements + cache
    //   unauthenticated (401): session was revoked server-side, log out
    //   network-error: keep cached state — DON'T log out
    const result = await fetchMe();
    if (result.kind === "ok" && result.data.authenticated) {
      const ent = result.data.entitlements ?? FREE_ENTITLEMENTS;
      setEntitlements(ent);
      try { localStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent)); } catch {}
    } else if (result.kind === "unauthenticated") {
      setUserId(null);
      setEmail(null);
      setIsLoggedIn(false);
      setEntitlements(FREE_ENTITLEMENTS);
      try { localStorage.removeItem(ENTITLEMENTS_KEY); } catch {}
      import("@/lib/iap/revenuecat-client")
        .then(({ resetIAPUser }) => resetIAPUser())
        .catch(() => { /* iap optional */ });
    }
    // network-error → silently keep the cached UI state
  }, []);

  // Subscribe to Supabase auth state and seed initial state.
  useEffect(() => {
    // Hydrate from cache so UI doesn't flash unauthenticated.
    try {
      const cached = localStorage.getItem(ENTITLEMENTS_KEY);
      if (cached) setEntitlements(JSON.parse(cached));
    } catch {}

    const supabase = getSupabaseBrowserClient();
    refresh().finally(() => setIsLoading(false));

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });

    return () => sub.subscription.unsubscribe();
  }, [refresh]);

  const login = useCallback(
    async (
      loginEmail: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password,
      });

      if (!error) return { success: true };

      // Maybe a legacy PBKDF2 user — try the migration endpoint.
      if (error.message.toLowerCase().includes("invalid")) {
        const legacyRes = await fetch("/api/auth/legacy-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: loginEmail.trim(), password }),
        });

        if (legacyRes.ok) {
          // Hash upgraded; retry the normal sign-in.
          const retry = await supabase.auth.signInWithPassword({
            email: loginEmail.trim(),
            password,
          });
          if (!retry.error) return { success: true };
          return { success: false, error: retry.error.message };
        }
      }

      return { success: false, error: error.message };
    },
    []
  );

  const register = useCallback(
    async (
      regEmail: string,
      password: string
    ): Promise<{ success: boolean; error?: string }> => {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signUp({
        email: regEmail.trim(),
        password,
      });
      if (error) return { success: false, error: error.message };
      return { success: true };
    },
    []
  );

  const loginWithApple = useCallback(
    async (payload: {
      identityToken?: string;
      code?: string;
    }): Promise<{ success: boolean; error?: string }> => {
      const supabase = getSupabaseBrowserClient();

      if (payload.identityToken) {
        // Native iOS path
        const { error } = await supabase.auth.signInWithIdToken({
          provider: "apple",
          token: payload.identityToken,
        });
        if (error) return { success: false, error: error.message };
        return { success: true };
      }

      if (payload.code) {
        // Web/Electron OAuth code-exchange path
        const { error } = await supabase.auth.exchangeCodeForSession(payload.code);
        if (error) return { success: false, error: error.message };
        return { success: true };
      }

      return { success: false, error: "Missing identityToken or code" };
    },
    []
  );

  const activate = useCallback(
    async (key: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/auth/link-license", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseKey: key.trim() }),
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          return { success: false, error: data.error || "Activation failed" };
        }
        await refresh();
        return { success: true };
      } catch {
        return { success: false, error: "Failed to connect to server" };
      }
    },
    [refresh]
  );

  const logout = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    setUserId(null);
    setEmail(null);
    setIsLoggedIn(false);
    setEntitlements(FREE_ENTITLEMENTS);
    try {
      localStorage.removeItem(ENTITLEMENTS_KEY);
    } catch {}
  }, []);

  const deleteAccount = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return { success: false, error: data.error || "Account deletion failed" };
      }
      // Wipe local IndexedDB so the next login on this device starts clean.
      try {
        const { wipeLocalDB } = await import("@/lib/db/indexed-db");
        await wipeLocalDB();
      } catch (err) {
        console.warn("[use-license] wipeLocalDB after deleteAccount failed:", err);
      }
      // Sign out client-side too, in case cookies aren't fully cleared by the response.
      try {
        const supabase = getSupabaseBrowserClient();
        await supabase.auth.signOut();
      } catch {}
      setUserId(null);
      setEmail(null);
      setIsLoggedIn(false);
      setEntitlements(FREE_ENTITLEMENTS);
      try {
        localStorage.removeItem(ENTITLEMENTS_KEY);
      } catch {}
      return { success: true };
    } catch {
      return { success: false, error: "Failed to connect to server" };
    }
  }, []);

  const isPro = entitlements.proActive;
  // Backward-compat alias used elsewhere in the codebase.
  const isActivated = isPro;

  return {
    userId,
    licenseKey: null as string | null,
    isActivated,
    isPro,
    entitlements,
    isLoading,
    isLoggedIn,
    email,
    login,
    loginWithApple,
    register,
    activate,
    logout,
    deleteAccount,
  };
}
