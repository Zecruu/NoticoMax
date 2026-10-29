"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { Wifi, WifiOff, RefreshCw, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusProps {
  syncing: boolean;
  onSync: () => void;
  isActivated: boolean;
}

export function SyncStatus({ syncing, onSync, isActivated }: SyncStatusProps) {
  const isOnline = useOnlineStatus();

  // Not activated: show "Local only"
  if (!isActivated) {
    return (
      <span title="Saved on this device" aria-label="Saved on this device" className="flex size-11 items-center justify-center gap-1.5 text-xs text-muted-foreground sm:h-auto sm:w-auto sm:px-3 sm:py-1.5">
        <HardDrive className="h-3 w-3" />
        <span className="hidden sm:inline">Local only</span>
      </span>
    );
  }

  return (
    <button
      onClick={onSync}
      aria-label={syncing ? "Syncing" : isOnline ? "Sync now" : "Offline"}
      title={syncing ? "Syncing" : isOnline ? "Sync now" : "Offline"}
      className={cn(
        "flex size-11 items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors sm:h-auto sm:w-auto sm:px-3 sm:py-1.5",
        isOnline
          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      )}
    >
      {syncing ? (
        <RefreshCw className="h-3 w-3 animate-spin" />
      ) : isOnline ? (
        <Wifi className="h-3 w-3" />
      ) : (
        <WifiOff className="h-3 w-3" />
      )}
      <span className="hidden sm:inline">{syncing ? "Syncing..." : isOnline ? "Online" : "Offline"}</span>
    </button>
  );
}
