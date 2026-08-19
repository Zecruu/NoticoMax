"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSubscriptionStatus,
  presentCustomerCenter,
  presentPaywall,
  restorePurchases,
} from "@/lib/iap/revenuecat-client";
import { toast } from "@/lib/native-toast";

interface SubscriptionCardProps {
  isIOSBilling: boolean;
  isPro: boolean;
  onRefresh: () => Promise<void>;
}

interface SubscriptionStatus {
  proActive: boolean;
  expiresAt: string | null;
  productId: string | null;
}

const PLAN_NAMES: Record<string, string> = {
  "com.noticomax.app.plus.monthly": "NoticoMax Plus",
  "com.noticomax.app.platinum.monthly": "NoticoMax Platinum",
  "com.noticomax.app.maxxed.monthly": "NoticoMax MAXXED",
  "com.noticomax.pro.monthly": "NoticoMax Pro",
};

export function SubscriptionCard({ isIOSBilling, isPro, onRefresh }: SubscriptionCardProps) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [action, setAction] = useState<"paywall" | "manage" | "restore" | null>(null);

  const loadStatus = useCallback(async () => {
    if (!isIOSBilling) return;
    try {
      setStatus(await getSubscriptionStatus());
    } catch (error) {
      console.warn("[subscription] failed to load RevenueCat status", error);
    }
  }, [isIOSBilling]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const refreshAccess = async () => {
    await loadStatus();
    await onRefresh();
    window.setTimeout(() => void onRefresh(), 1500);
  };

  const handlePaywall = async () => {
    setAction("paywall");
    try {
      const outcome = await presentPaywall();
      if (outcome === "purchased" || outcome === "restored") {
        await refreshAccess();
        toast.success(outcome === "purchased" ? "Subscription activated" : "Purchases restored");
      } else if (outcome === "error" || outcome === "not_presented") {
        toast.error("Unable to open subscription plans");
      }
    } catch (error) {
      console.error("[subscription] paywall failed", error);
      toast.error("Unable to open subscription plans");
    } finally {
      setAction(null);
    }
  };

  const handleManage = async () => {
    setAction("manage");
    try {
      await presentCustomerCenter();
      await refreshAccess();
    } catch (error) {
      console.error("[subscription] customer center failed", error);
      toast.error("Unable to open subscription management");
    } finally {
      setAction(null);
    }
  };

  const handleRestore = async () => {
    setAction("restore");
    try {
      if (await restorePurchases()) {
        await refreshAccess();
        toast.success("Purchases restored");
      } else {
        toast.info("No active subscription was found");
      }
    } catch (error) {
      console.error("[subscription] restore failed", error);
      toast.error("Unable to restore purchases");
    } finally {
      setAction(null);
    }
  };

  const active = status?.proActive || isPro;
  const planName = status?.productId ? PLAN_NAMES[status.productId] ?? "NoticoMax subscription" : null;
  const renewalDate = status?.expiresAt
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(status.expiresAt))
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4" />
          Subscription & Billing
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{active ? planName ?? "Pro access active" : "Free plan"}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {active
                ? renewalDate
                  ? `Renews or expires ${renewalDate}`
                  : "Lyte and online sync are unlocked."
                : "Choose Plus, Platinum, or MAXXED for Lyte and online sync."}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-medium ${
              active
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {active ? "Active" : "Free"}
          </span>
        </div>

        {isIOSBilling ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              className="min-h-11 gap-2"
              disabled={action !== null}
              onClick={handlePaywall}
            >
              <Sparkles className="h-4 w-4" />
              {action === "paywall" ? "Opening plans..." : active ? "View or change plan" : "View plans"}
            </Button>
            {active && (
              <Button
                variant="outline"
                className="min-h-11 gap-2"
                disabled={action !== null}
                onClick={handleManage}
              >
                <CreditCard className="h-4 w-4" />
                {action === "manage" ? "Opening..." : "Manage billing"}
              </Button>
            )}
            <Button
              variant="ghost"
              className="min-h-11 gap-2"
              disabled={action !== null}
              onClick={handleRestore}
            >
              <RefreshCw className={`h-4 w-4 ${action === "restore" ? "animate-spin" : ""}`} />
              Restore purchases
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Apple subscriptions can be purchased and managed in NoticoMax on iPhone or iPad.
            </p>
            <Button variant="outline" className="min-h-11" asChild>
              <a href="https://noticomax.com/pricing" target="_blank" rel="noopener noreferrer">
                View plan details
              </a>
            </Button>
          </div>
        )}

        <div className="flex gap-4 border-t pt-3 text-xs text-muted-foreground">
          <a href="https://noticomax.com/terms" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            Terms of Use
          </a>
          <a href="https://noticomax.com/privacy" target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
            Privacy Policy
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
