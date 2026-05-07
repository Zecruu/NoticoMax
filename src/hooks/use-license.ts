"use client";

import { useState, useEffect, useCallback } from "react";
import type { ComputedEntitlements } from "@/lib/entitlements";
import { identifyIAPUser, resetIAPUser } from "@/lib/iap/revenuecat-client";
import { wipeLocalDB } from "@/lib/db/indexed-db";
import { mergeDeviceNamesFromServer, getDeviceId, getDeviceName } from "@/lib/device";

/**
 * After login, push the local device's chosen name up to the server so other
 * devices on this account can see it. Best-effort; no-op if no session.
 */
async function pushLocalDeviceNameOnLogin(sessionToken: string): Promise<void> {
  try {
    await fetch("/api/user/device-names", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ deviceId: getDeviceId(), name: getDeviceName() }),
    });
  } catch {
    /* best effort */
  }
}

/**
 * Wipe local IndexedDB if a different user is signing in. Local data is
 * shared across logins on the device, so without this a new account would
 * see the prior account's notes.
 */
async function wipeIfUserChanged(newUserId: string): Promise<void> {
  const prev = localStorage.getItem(USER_ID_KEY);
  if (prev && prev !== newUserId) {
    try {
      await wipeLocalDB();
    } catch (err) {
      console.warn("[use-license] wipeLocalDB failed:", err);
    }
  }
}

const SESSION_KEY = "noticomax_session";
const LICENSE_KEY = "noticomax_license_key";
const EMAIL_KEY = "noticomax_email";
const USER_ID_KEY = "noticomax_user_id";
const ENTITLEMENTS_KEY = "noticomax_entitlements";

const FREE_ENTITLEMENTS: ComputedEntitlements = {
  proActive: false,
  syncEnabled: false,
  adsRemoved: false,
};

export function useLicense() {
  const [licenseKey, setLicenseKeyState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [entitlements, setEntitlements] = useState<ComputedEntitlements>(FREE_ENTITLEMENTS);

  // On mount, verify stored session
  useEffect(() => {
    const sessionToken = localStorage.getItem(SESSION_KEY);
    const storedEmail = localStorage.getItem(EMAIL_KEY);
    const storedUserId = localStorage.getItem(USER_ID_KEY);
    const storedLicense = localStorage.getItem(LICENSE_KEY);
    const storedEnt = localStorage.getItem(ENTITLEMENTS_KEY);

    if (!sessionToken) {
      setIsLoading(false);
      return;
    }

    // Set cached values immediately for fast UI
    if (storedEmail) setEmail(storedEmail);
    if (storedUserId) {
      setUserId(storedUserId);
      identifyIAPUser(storedUserId).catch(() => { /* iap optional */ });
    }
    if (storedLicense) setLicenseKeyState(storedLicense);
    if (storedEmail) setIsLoggedIn(true);
    if (storedEnt) {
      try {
        setEntitlements(JSON.parse(storedEnt));
      } catch {
        // ignore corrupt cache
      }
    }

    // Verify session with server and get latest license key
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then(async (data) => {
        if (data?.success) {
          setEmail(data.email);
          setIsLoggedIn(true);
          localStorage.setItem(EMAIL_KEY, data.email);
          if (data.userId) {
            await wipeIfUserChanged(data.userId);
            setUserId(data.userId);
            localStorage.setItem(USER_ID_KEY, data.userId);
            identifyIAPUser(data.userId).catch(() => { /* iap optional */ });
          }
          if (data.deviceNames) {
            mergeDeviceNamesFromServer(data.deviceNames);
          }
          // Push this device's local name up in case it's never been synced
          pushLocalDeviceNameOnLogin(sessionToken);
          if (data.licenseKey) {
            setLicenseKeyState(data.licenseKey);
            localStorage.setItem(LICENSE_KEY, data.licenseKey);
          } else {
            // Server says no license, clear local
            setLicenseKeyState(null);
            localStorage.removeItem(LICENSE_KEY);
          }
          const ent: ComputedEntitlements = data.entitlements ?? FREE_ENTITLEMENTS;
          setEntitlements(ent);
          localStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent));
        } else {
          // Session expired, clear everything EXCEPT USER_ID_KEY — we keep
          // that as a "last user" marker so the next login can detect a
          // user-switch and wipe local IndexedDB (see wipeIfUserChanged).
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(EMAIL_KEY);
          localStorage.removeItem(LICENSE_KEY);
          localStorage.removeItem(ENTITLEMENTS_KEY);
          setIsLoggedIn(false);
          setEmail(null);
          setLicenseKeyState(null);
          setEntitlements(FREE_ENTITLEMENTS);
          resetIAPUser().catch(() => { /* iap optional */ });
        }
      })
      .catch(() => {
        // Network error - keep cached values
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (loginEmail: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Login failed" };
      }
      localStorage.setItem(SESSION_KEY, data.sessionToken);
      localStorage.setItem(EMAIL_KEY, data.email);
      setEmail(data.email);
      setIsLoggedIn(true);
      if (data.userId) {
        await wipeIfUserChanged(data.userId);
        setUserId(data.userId);
        localStorage.setItem(USER_ID_KEY, data.userId);
        identifyIAPUser(data.userId).catch(() => { /* iap optional */ });
      }
      if (data.deviceNames) {
        mergeDeviceNamesFromServer(data.deviceNames);
      }
      pushLocalDeviceNameOnLogin(data.sessionToken);
      if (data.licenseKey) {
        localStorage.setItem(LICENSE_KEY, data.licenseKey);
        setLicenseKeyState(data.licenseKey);
      }
      const ent: ComputedEntitlements = data.entitlements ?? FREE_ENTITLEMENTS;
      setEntitlements(ent);
      localStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent));
      return { success: true };
    } catch {
      return { success: false, error: "Failed to connect to server" };
    }
  }, []);

  const loginWithApple = useCallback(async (payload: {
    identityToken?: string;
    code?: string;
    email?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/apple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Apple sign-in failed" };
      }
      localStorage.setItem(SESSION_KEY, data.sessionToken);
      localStorage.setItem(EMAIL_KEY, data.email);
      setEmail(data.email);
      setIsLoggedIn(true);
      if (data.userId) {
        await wipeIfUserChanged(data.userId);
        setUserId(data.userId);
        localStorage.setItem(USER_ID_KEY, data.userId);
        identifyIAPUser(data.userId).catch(() => { /* iap optional */ });
      }
      if (data.deviceNames) {
        mergeDeviceNamesFromServer(data.deviceNames);
      }
      pushLocalDeviceNameOnLogin(data.sessionToken);
      if (data.licenseKey) {
        localStorage.setItem(LICENSE_KEY, data.licenseKey);
        setLicenseKeyState(data.licenseKey);
      }
      const ent: ComputedEntitlements = data.entitlements ?? FREE_ENTITLEMENTS;
      setEntitlements(ent);
      localStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent));
      return { success: true };
    } catch {
      return { success: false, error: "Failed to connect to server" };
    }
  }, []);

  const register = useCallback(async (regEmail: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Registration failed" };
      }
      localStorage.setItem(SESSION_KEY, data.sessionToken);
      localStorage.setItem(EMAIL_KEY, data.email);
      setEmail(data.email);
      setIsLoggedIn(true);
      if (data.userId) {
        await wipeIfUserChanged(data.userId);
        setUserId(data.userId);
        localStorage.setItem(USER_ID_KEY, data.userId);
        identifyIAPUser(data.userId).catch(() => { /* iap optional */ });
      }
      if (data.deviceNames) {
        mergeDeviceNamesFromServer(data.deviceNames);
      }
      pushLocalDeviceNameOnLogin(data.sessionToken);
      if (data.licenseKey) {
        localStorage.setItem(LICENSE_KEY, data.licenseKey);
        setLicenseKeyState(data.licenseKey);
      }
      const ent: ComputedEntitlements = data.entitlements ?? FREE_ENTITLEMENTS;
      setEntitlements(ent);
      localStorage.setItem(ENTITLEMENTS_KEY, JSON.stringify(ent));
      return { success: true };
    } catch {
      return { success: false, error: "Failed to connect to server" };
    }
  }, []);

  const activate = useCallback(async (key: string): Promise<{ success: boolean; error?: string }> => {
    const sessionToken = localStorage.getItem(SESSION_KEY);
    if (!sessionToken) {
      return { success: false, error: "You must be logged in to activate a license" };
    }
    try {
      const res = await fetch("/api/auth/link-license", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken, licenseKey: key.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Activation failed" };
      }
      localStorage.setItem(LICENSE_KEY, key.trim());
      setLicenseKeyState(key.trim());
      return { success: true };
    } catch {
      return { success: false, error: "Failed to connect to server" };
    }
  }, []);

  const logout = useCallback(() => {
    // Keep USER_ID_KEY across logout — see wipeIfUserChanged. Wiping it here
    // means the next login as a different user wouldn't see a user-switch
    // and local IndexedDB would still hold the prior user's data.
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LICENSE_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(ENTITLEMENTS_KEY);
    setLicenseKeyState(null);
    setEmail(null);
    setIsLoggedIn(false);
    setEntitlements(FREE_ENTITLEMENTS);
    resetIAPUser().catch(() => { /* iap optional */ });
  }, []);

  // Pro is the canonical "is this user paying" check.
  // Legacy isActivated is kept for backward compat with components that
  // gate sync on the license key — Pro implies sync access.
  const isPro = entitlements.proActive;
  const isActivated = isPro || !!licenseKey;

  return {
    licenseKey,
    isActivated,
    isPro,
    entitlements,
    isLoading,
    isLoggedIn,
    email,
    userId,
    login,
    loginWithApple,
    register,
    activate,
    logout,
  };
}
