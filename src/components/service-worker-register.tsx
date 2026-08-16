"use client";

import { useEffect } from "react";

type ServiceWorkerRuntime = typeof globalThis & {
  navigator?: {
    serviceWorker?: {
      register: (scriptURL: string) => {
        catch: (onRejected: (reason: unknown) => void) => unknown;
      };
    };
  };
};

const serviceWorkerRuntime = globalThis as ServiceWorkerRuntime;

export function ServiceWorkerRegister() {
  useEffect(() => {
    const serviceWorker = serviceWorkerRuntime.navigator?.serviceWorker;

    if (
      process.env.NODE_ENV !== "production" ||
      !serviceWorker
    ) {
      return;
    }

    serviceWorker.register("/sw.js").catch((err: unknown) => {
      console.warn("[service-worker] registration failed", err);
    });
  }, []);

  return null;
}
