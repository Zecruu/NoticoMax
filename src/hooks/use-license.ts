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
      setUserId(me.userId);
      setEmail(me.email ?? null);
      setIsLoggedIn(true);
      const ent = me.entitlements ?? FREE_ENTITLEMENTS;
      setEntitlements(ent);
      try {
        localStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent));
      } catch {}
    } else {
      setUserId(null);
      setEmail(null);
      setIsLoggedIn(false);
      setEntitlements(FREE_ENTITLEMENTS);
      try {
        localStorage.removeItem(ENTITLEMENTS_KEY);
      } catch {}
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
  };
}
