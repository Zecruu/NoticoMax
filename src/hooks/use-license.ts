"use client";

import { useState, useEffect, useCallback } from "react";
import type { ComputedEntitlements } from "@/lib/entitlements";

const SESSION_KEY = "noticomax_session";
const LICENSE_KEY = "noticomax_license_key";
const EMAIL_KEY = "noticomax_email";
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [entitlements, setEntitlements] = useState<ComputedEntitlements>(FREE_ENTITLEMENTS);

  // On mount, verify stored session
  useEffect(() => {
    const sessionToken = localStorage.getItem(SESSION_KEY);
    const storedEmail = localStorage.getItem(EMAIL_KEY);
    const storedLicense = localStorage.getItem(LICENSE_KEY);
    const storedEnt = localStorage.getItem(ENTITLEMENTS_KEY);

    if (!sessionToken) {
      setIsLoading(false);
      return;
    }

    // Set cached values immediately for fast UI
    if (storedEmail) setEmail(storedEmail);
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
      .then((data) => {
        if (data?.success) {
          setEmail(data.email);
          setIsLoggedIn(true);
          localStorage.setItem(EMAIL_KEY, data.email);
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
          // Session expired, clear everything
          localStorage.removeItem(SESSION_KEY);
          localStorage.removeItem(EMAIL_KEY);
          localStorage.removeItem(LICENSE_KEY);
          localStorage.removeItem(ENTITLEMENTS_KEY);
          setIsLoggedIn(false);
          setEmail(null);
          setLicenseKeyState(null);
          setEntitlements(FREE_ENTITLEMENTS);
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
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LICENSE_KEY);
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(ENTITLEMENTS_KEY);
    setLicenseKeyState(null);
    setEmail(null);
    setIsLoggedIn(false);
    setEntitlements(FREE_ENTITLEMENTS);
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
    login,
    register,
    activate,
    logout,
  };
}
