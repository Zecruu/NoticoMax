"use client";

import { useCallback, useEffect, useState } from "react";

// Which collapsible sidebar sections the user has chosen to show.
// General + Shared + Folders are always visible. The "Developer" section is
// hidden by default (most users aren't developers); flip it on in Settings.
export interface SidebarPrefs {
  showDeveloper: boolean;
}

const STORAGE_KEY = "noticomax_sidebar_prefs";

const DEFAULTS: SidebarPrefs = {
  showDeveloper: false,
};

function readStored(): SidebarPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

export function useSidebarPrefs(): SidebarPrefs & {
  setShowDeveloper: (v: boolean) => void;
} {
  const [prefs, setPrefs] = useState<SidebarPrefs>(DEFAULTS);

  useEffect(() => {
    setPrefs(readStored());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setPrefs(readStored());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<SidebarPrefs>) => {
    setPrefs((cur) => {
      const next = { ...cur, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* localStorage full or denied — non-fatal */ }
      return next;
    });
  }, []);

  return {
    ...prefs,
    setShowDeveloper: (v) => update({ showDeveloper: v }),
  };
}
