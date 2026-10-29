"use client";

import { useLicense } from "@/hooks/use-license";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

import { formatBytes, storageTier } from "@/lib/billing/storage";

export function StorageCard() {
  const { entitlements } = useLicense();
  const current = entitlements.storagePlan ?? "free";
  const used = entitlements.storageBytesUsed ?? 0;
  const tier = storageTier(current);
  const total = tier.bytes;
  const percent = total > 0 ? Math.min(100, (used / total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-4 w-4" />
          Cloud Storage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current usage */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{tier.label}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatBytes(used)} of {formatBytes(total)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full transition-[width] duration-200",
                percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Saved Lyte conversations count toward your cloud storage. Delete past chats in Lyte to free space. In-progress replies temporarily reserve space.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
