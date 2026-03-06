"use client";

import { useState, useEffect, useCallback } from "react";

const LICENSE_STORAGE_KEY = "noticomax_license_key";

export function useLicense() {
  const [licenseKey, setLicenseKeyState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (stored) {
      setLicenseKeyState(stored);
    }
    setIsLoading(false);
  }, []);

  const activate = useCallback(async (key: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/license/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ licenseKey: key.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || "Activation failed" };
      }
      localStorage.setItem(LICENSE_STORAGE_KEY, key.trim());
      setLicenseKeyState(key.trim());
      setEmail(data.email || null);
      return { success: true };
    } catch {
      return { success: false, error: "Failed to connect to server" };
    }
  }, []);

  const deactivate = useCallback(() => {
    localStorage.removeItem(LICENSE_STORAGE_KEY);
    setLicenseKeyState(null);
    setEmail(null);
  }, []);

  const isActivated = !!licenseKey;

  return {
    licenseKey,
    isActivated,
    isLoading,
    email,
    activate,
    deactivate,
  };
}
