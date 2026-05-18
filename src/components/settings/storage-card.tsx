"use client";

import { useState } from "react";
import { useLicense, type StoragePlan } from "@/hooks/use-license";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { HardDrive, Sparkles, Loader2, Check, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";

// Storage tier definitions — pricing + bytes. Keep in sync with the product
// IDs configured in RevenueCat (src/app/api/iap/revenuecat-webhook).
//
// Free tier: 100 MB included with any Pro user (covers the file-attachment
// feature when it ships — not enforced today since uploads aren't built).
const FREE_BYTES = 100 * 1024 * 1024; // 100 MB

interface PlanTier {
  plan: StoragePlan;
  productId: string;
  label: string;
  bytes: number;
  monthly: string;
  /** Family tiers require an active Family Plan to purchase. */
  requiresFamily?: boolean;
}

const PERSONAL_TIERS: PlanTier[] = [
  { plan: "personal_5gb",   productId: "storage_personal_5gb",   label: "Personal 5 GB",   bytes: 5 * 1024 ** 3,   monthly: "$0.99" },
  { plan: "personal_50gb",  productId: "storage_personal_50gb",  label: "Personal 50 GB",  bytes: 50 * 1024 ** 3,  monthly: "$1.99" },
  { plan: "personal_200gb", productId: "storage_personal_200gb", label: "Personal 200 GB", bytes: 200 * 1024 ** 3, monthly: "$3.99" },
];

const FAMILY_TIERS: PlanTier[] = [
  { plan: "family_20gb",  productId: "storage_family_20gb",  label: "Family 20 GB",  bytes: 20 * 1024 ** 3,  monthly: "$2.99", requiresFamily: true },
  { plan: "family_100gb", productId: "storage_family_100gb", label: "Family 100 GB", bytes: 100 * 1024 ** 3, monthly: "$4.99", requiresFamily: true },
  { plan: "family_500gb", productId: "storage_family_500gb", label: "Family 500 GB", bytes: 500 * 1024 ** 3, monthly: "$9.99", requiresFamily: true },
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
  const canBuyFamily = !!entitlements.familyPlanActive || !!entitlements.lifetimePro;

  const [buying, setBuying] = useState<string | null>(null);

  const buyTier = async (tier: PlanTier) => {
    if (tier.requiresFamily && !canBuyFamily) {
      toast.error("Family storage requires an active Family Plan");
      return;
    }
    setBuying(tier.productId);
    try {
      const { purchase } = await import("@/lib/iap/revenuecat-client");
      const ok = await purchase(tier.productId);
      if (ok) {
        toast.success(`${tier.label} active`);
      } else {
        toast.error("Purchase cancelled");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start purchase");
    } finally {
      setBuying(null);
    }
  };

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

        {/* Personal plans */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Personal storage
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {PERSONAL_TIERS.map((t) => {
              const isCurrent = current === t.plan;
              return (
                <button
                  key={t.plan}
                  onClick={() => void buyTier(t)}
                  disabled={isCurrent || buying === t.productId}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/40 active:bg-muted/60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{t.label}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {buying === t.productId ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Purchasing…
                      </span>
                    ) : (
                      `${t.monthly}/mo`
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Family plans */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Family storage
            </p>
            {!canBuyFamily && (
              <span className="text-[10px] rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 px-1.5 py-0.5">
                Family Plan required
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {FAMILY_TIERS.map((t) => {
              const isCurrent = current === t.plan;
              const disabled = isCurrent || buying === t.productId || !canBuyFamily;
              return (
                <button
                  key={t.plan}
                  onClick={() => void buyTier(t)}
                  disabled={disabled}
                  className={cn(
                    "rounded-md border p-3 text-left transition-colors",
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : disabled
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:bg-muted/40 active:bg-muted/60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{t.label}</span>
                    {isCurrent && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {buying === t.productId ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Purchasing…
                      </span>
                    ) : (
                      `${t.monthly}/mo`
                    )}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
