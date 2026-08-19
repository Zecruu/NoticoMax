"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { Wifi, WifiOff, RefreshCw, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

interface SyncStatusProps {
  syncing: boolean;
  onSync: () => void;
  isActivated: boolean;
  compact?: boolean;
}

export function SyncStatus({ syncing, onSync, isActivated, compact = false }: SyncStatusProps) {
  const isOnline = useOnlineStatus();

  // Not activated: show "Local only"
  if (!isActivated) {
    return (
      <span
        className={cn(
          "flex items-center justify-center gap-1.5 rounded-md bg-blue-500/10 text-xs font-medium text-blue-600 dark:text-blue-400",
          compact ? "h-11 w-11" : "rounded-full px-3 py-1.5",
        )}
        aria-label="Stored locally"
        title="Stored locally"
      >
        <HardDrive className="h-3 w-3" />
        {!compact && "Local only"}
      </span>
    );
  }

  return (
    <button
      onClick={onSync}
      aria-label={syncing ? "Syncing" : isOnline ? "Online. Sync now" : "Offline"}
      title={syncing ? "Syncing" : isOnline ? "Online. Sync now" : "Offline"}
      className={cn(
        "flex items-center justify-center gap-1.5 text-xs font-medium transition-colors",
        compact ? "h-11 w-11 rounded-md" : "rounded-full px-3 py-1.5",
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
      {!compact && (syncing ? "Syncing..." : isOnline ? "Online" : "Offline")}
    </button>
  );
}
