"use client";

import { useOnlineStatus } from "@/hooks/use-online-status";
import { Wifi, WifiOff, RefreshCw, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { type UserTier } from "@/hooks/use-subscription";
import Link from "next/link";

interface SyncStatusProps {
  syncing: boolean;
  onSync: () => void;
  tier: UserTier;
}

export function SyncStatus({ syncing, onSync, tier }: SyncStatusProps) {
  const isOnline = useOnlineStatus();

  // Free/anonymous: show "Local only"
  if (tier !== "pro") {
    return (
      <Link
        href="/pricing"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors hover:bg-blue-500/20"
      >
        <HardDrive className="h-3 w-3" />
        Local only
      </Link>
    );
  }

  return (
    <button
      onClick={onSync}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
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
      {syncing ? "Syncing..." : isOnline ? "Online" : "Offline"}
    </button>
  );
}
