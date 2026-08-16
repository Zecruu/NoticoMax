"use client";

import { useEffect } from "react";
import { RefreshCw, WifiOff } from "lucide-react";

type BrowserRuntime = typeof globalThis & {
  location: { href: string };
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
};

const browserRuntime = globalThis as BrowserRuntime;

export default function OfflinePage() {
  const retry = () => {
    browserRuntime.location.href = "/";
  };

  useEffect(() => {
    const handleOnline = () => {
      browserRuntime.location.href = "/";
    };

    browserRuntime.addEventListener("online", handleOnline);
    return () => browserRuntime.removeEventListener("online", handleOnline);
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
        <div className="mb-8 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NOTICO MAX" className="h-11 w-11 rounded-lg" />
          <div>
            <p className="text-sm font-semibold tracking-wide">NOTICO MAX</p>
            <p className="text-xs text-muted-foreground">Offline mode</p>
          </div>
        </div>

        <div className="space-y-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <WifiOff className="h-6 w-6" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-normal">You are offline</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              NoticoMax could not reach the live app. If this device has cached
              your workspace, notes and reminders will be available again as soon
              as the app shell finishes loading.
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4 text-sm text-card-foreground">
            <p className="font-medium">What still works</p>
            <p className="mt-1 leading-6 text-muted-foreground">
              Previously saved local data stays on this device. Cloud sync,
              account changes, and assistant requests resume when the connection
              returns.
            </p>
          </div>

          <button
            type="button"
            onClick={retry}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}
