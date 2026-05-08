"use client";

import { useState, useEffect, useCallback } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export interface ComputedEntitlements {
  proActive: boolean;
  syncEnabled: boolean;
  adsRemoved: boolean;
  source?: string | null;
  expiresAt?: string | null;
  lifetimePro?: boolean;
}

const FREE_ENTITLEMENTS: ComputedEntitlements = {
  proActive: false,
  syncEnabled: false,
  adsRemoved: false,
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

async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

export function useLicense() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [entitlements, setEntitlements] = useState<ComputedEntitlements>(FREE_ENTITLEMENTS);

  // Refresh state from /api/auth/me; called on mount and on auth changes.
  const refresh = useCallback(async () => {
    const me = await fetchMe();
    if (me?.authenticated && me.userId) {
      await wipeIfUserChanged(me.userId);
      setUserId(me.userId);
      setEmail(me.email ?? null);
      setIsLoggedIn(true);
      const ent = me.entitlements ?? FREE_ENTITLEMENTS;
      setEntitlements(ent);
      try {
        localStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent));
      } catch {}
      // Tell RevenueCat which Supabase user this device represents so a
      // purchase webhook can be matched back to the right entitlements row.
      // Anonymous purchases that happened before logIn are aliased to this
      // userId by RC automatically.
      import("@/lib/iap/revenuecat-client")
        .then(({ identifyIAPUser }) => identifyIAPUser(me.userId!))
        .catch(() => { /* iap optional */ });
    } else {
      setUserId(null);
      setEmail(null);
      setIsLoggedIn(false);
      setEntitlements(FREE_ENTITLEMENTS);
      try {
        localStorage.removeItem(ENTITLEMENTS_KEY);
      } catch {}
      import("@/lib/iap/revenuecat-client")
        .then(({ resetIAPUser }) => resetIAPUser())
        .catch(() => { /* iap optional */ });
    }
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
