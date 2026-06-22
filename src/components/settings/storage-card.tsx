"use client";

import { useLicense, type StoragePlan } from "@/hooks/use-license";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";

// Storage tier definitions — bytes per plan. Keep in sync with the product
// IDs configured in RevenueCat (src/app/api/iap/revenuecat-webhook).
//
// Visible pricing + purchase tiles are hidden for now (pending the Free / Pro /
// Family pricing redesign), but these tables stay so usage display can resolve
// a plan's byte allowance and label.
//
// Free tier: 100 MB included with any Pro user (covers the file-attachment
// feature when it ships — not enforced today since uploads aren't built).
const FREE_BYTES = 100 * 1024 * 1024; // 100 MB

interface PlanTier {
  plan: StoragePlan;
  productId: string;
  label: string;
  bytes: number;
}

const PERSONAL_TIERS: PlanTier[] = [
  { plan: "personal_5gb",   productId: "storage_personal_5gb",   label: "Personal 5 GB",   bytes: 5 * 1024 ** 3 },
  { plan: "personal_50gb",  productId: "storage_personal_50gb",  label: "Personal 50 GB",  bytes: 50 * 1024 ** 3 },
  { plan: "personal_200gb", productId: "storage_personal_200gb", label: "Personal 200 GB", bytes: 200 * 1024 ** 3 },
];

const FAMILY_TIERS: PlanTier[] = [
  { plan: "family_20gb",  productId: "storage_family_20gb",  label: "Family 20 GB",  bytes: 20 * 1024 ** 3 },
  { plan: "family_100gb", productId: "storage_family_100gb", label: "Family 100 GB", bytes: 100 * 1024 ** 3 },
  { plan: "family_500gb", productId: "storage_family_500gb", label: "Family 500 GB", bytes: 500 * 1024 ** 3 },
];

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(bytes >= 10 * 1024 ** 3 ? 0 : 1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function planBytes(plan: StoragePlan): number {
  if (plan === "free") return FREE_BYTES;
  const t = [...PERSONAL_TIERS, ...FAMILY_TIERS].find((x) => x.plan === plan);
  return t?.bytes ?? FREE_BYTES;
}

function planLabel(plan: StoragePlan): string {
  if (plan === "free") return "Free (100 MB)";
  const t = [...PERSONAL_TIERS, ...FAMILY_TIERS].find((x) => x.plan === plan);
  return t?.label ?? "Free";
}

export function StorageCard() {
  const { entitlements } = useLicense();
  const current = entitlements.storagePlan ?? "free";
  const used = entitlements.storageBytesUsed ?? 0;
  const total = planBytes(current);
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
            <span className="text-sm font-medium">{planLabel(current)}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatBytes(used)} of {formatBytes(total)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full transition-all",
                percent >= 90 ? "bg-destructive" : percent >= 75 ? "bg-amber-500" : "bg-primary",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            File uploads / attachments are coming soon — your usage will start counting once they ship.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
