"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/hooks/use-license";
import { isIOS } from "@/lib/platform";
import {
  formatPlanRenewal,
  getPlan,
  resolveCurrentPlanId,
  type PlanId,
} from "@/lib/billing/plans";
import { presentCustomerCenter, presentPaywall } from "@/lib/iap/revenuecat-client";
import { toast } from "@/lib/native-toast";
import { cn } from "@/lib/utils";

interface PlanStatusCardProps {
  className?: string;
}

export function PlanStatusCard({ className }: PlanStatusCardProps) {
  const { entitlements, isLoggedIn, refresh } = useLicense();
  const [iosBilling, setIosBilling] = useState(false);
  const [busy, setBusy] = useState<"upgrade" | "manage" | null>(null);

  useEffect(() => {
    setIosBilling(isIOS());
  }, []);

  const planId = resolveCurrentPlanId(entitlements);
  const plan = getPlan(planId);
  const renewal = formatPlanRenewal(entitlements.expiresAt);
  const paid = planId !== "free";

  const summary = paid
    ? entitlements.lifetimePro
      ? "Lifetime Pro is active. Cloud sync stays on."
      : renewal
        ? `${plan.name} renews ${renewal}.`
        : `${plan.name} is active. Cloud sync is on.`
    : "Local-only notes on this device. Upgrade to Pro, Platinum, or MAXXED for sync, no ads, and Lyte.";

  async function handleUpgrade() {
    if (!iosBilling) return;
    setBusy("upgrade");
    try {
      const result = await presentPaywall();
      if (result === "purchased" || result === "restored") {
        await refresh();
        toast.success(result === "restored" ? "Purchases restored." : "Plan updated.");
      } else if (result === "error") {
        toast.error("Could not open plans. Try again from Settings.");
      }
    } catch (error) {
      console.error("[plan-status] paywall failed", error);
      toast.error("Could not open plans.");
    } finally {
      setBusy(null);
    }
  }

  async function handleManage() {
    if (!iosBilling) return;
    setBusy("manage");
    try {
      await presentCustomerCenter();
    } catch (error) {
      console.error("[plan-status] customer center failed", error);
      toast.error("Could not open subscription management.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section
      className={cn(
        "rounded-2xl border bg-card p-4 shadow-sm sm:p-5",
        !paid && "border-primary/30 bg-primary/5",
        className,
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            {paid ? (
              <CreditCard className="h-4 w-4 text-primary" />
            ) : (
              <Sparkles className="h-4 w-4 text-primary" />
            )}
            <p className="text-sm font-semibold">
              {paid ? `${plan.name} plan` : "Upgrade your plan"}
            </p>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-medium",
                paid
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-primary/10 text-primary",
              )}
            >
              {plan.name}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{summary}</p>
          {!paid && (
            <p className="text-xs text-muted-foreground">
              Pro, Platinum, or MAXXED — see every plan and Lyte allowance.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {paid && iosBilling && (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void handleManage()}
            >
              {busy === "manage" ? "Opening…" : "Manage plan"}
            </Button>
          )}
          {!paid && iosBilling && (
            <Button size="sm" disabled={busy !== null} onClick={() => void handleUpgrade()}>
              {busy === "upgrade" ? "Opening…" : "Upgrade"}
            </Button>
          )}
          <Button variant={paid || !iosBilling ? "default" : "outline"} size="sm" asChild>
            <Link href="/pricing">{paid ? "View plans" : "See plans"}</Link>
          </Button>
          {!isLoggedIn && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/">Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
