"use client";

import { useState, useEffect, useCallback, useRef } from "react";

export function useSWUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingSW = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    const onWaiting = (sw: ServiceWorker) => {
      waitingSW.current = sw;
      setUpdateAvailable(true);
    };

    // Reload when the new SW takes control
    const onControllerChange = () => {
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.ready.then((registration) => {
      // Check if there's already a waiting SW
      if (registration.waiting) {
        onWaiting(registration.waiting);
      }

      // Listen for new SW installations
      registration.addEventListener("updatefound", () => {
        const newSW = registration.installing;
        if (!newSW) return;

        newSW.addEventListener("statechange", () => {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            // New SW installed while an old one is still controlling — update available
            onWaiting(newSW);
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (waitingSW.current) {
      waitingSW.current.postMessage({ type: "SKIP_WAITING" });
    }
  }, []);

  return { updateAvailable, applyUpdate };
}
