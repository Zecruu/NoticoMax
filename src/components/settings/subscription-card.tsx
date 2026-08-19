"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { CreditCard, ExternalLink as ExternalLinkIcon, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSubscriptionStatus,
  presentCustomerCenter,
  presentPaywall,
  restorePurchases,
} from "@/lib/iap/revenuecat-client";
import {
  getSubscriptionPlanName,
  refreshEntitlementWithRetries,
} from "@/lib/iap/subscription-billing";
import { openInBrowser } from "@/lib/capacitor/auth-helpers";
import { toast } from "@/lib/native-toast";

interface SubscriptionCardProps {
  isIOSBilling: boolean;
  isPro: boolean;
  onRefresh: () => Promise<boolean>;
}

interface SubscriptionStatus {
  proActive: boolean;
  expiresAt: string | null;
  productId: string | null;
}

const PAYWALL_OPENING_STATE_MS = 3_000;

interface PublicLinkProps {
  children: ReactNode;
  className?: string;
  href: string;
  native: boolean;
}

function PublicLink({ children, className, href, native }: PublicLinkProps) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!native) return;
    event.preventDefault();
    void openInBrowser(href)
      .then((opened) => {
        if (!opened) toast.error("Unable to open this link");
      })
      .catch((error) => {
        console.error("[subscription] external link failed", error);
        toast.error("Unable to open this link");
      });
  };

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={handleClick}
    >
      {children}
    </a>
  );
}

export function SubscriptionCard({ isIOSBilling, isPro, onRefresh }: SubscriptionCardProps) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [action, setAction] = useState<"paywall" | "manage" | "restore" | null>(null);
  const mountedRef = useRef(false);
  const retryTimersRef = useRef(new Map<number, (mounted: boolean) => void>());
  const paywallOpeningTimerRef = useRef<number | null>(null);
  const paywallRunRef = useRef(0);

  useEffect(() => {
    const retryTimers = retryTimersRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      paywallRunRef.current += 1;
      if (paywallOpeningTimerRef.current !== null) {
        window.clearTimeout(paywallOpeningTimerRef.current);
        paywallOpeningTimerRef.current = null;
      }
      for (const [timerId, resolve] of retryTimers) {
        window.clearTimeout(timerId);
        resolve(false);
      }
      retryTimers.clear();
    };
  }, []);

  const loadStatus = useCallback(async () => {
    if (!isIOSBilling) return;
    try {
      const nextStatus = await getSubscriptionStatus();
      if (mountedRef.current) setStatus(nextStatus);
    } catch (error) {
      console.warn("[subscription] failed to load RevenueCat status", error);
    }
  }, [isIOSBilling]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const waitForRetry = useCallback((delayMs: number) => {
    return new Promise<boolean>((resolve) => {
      if (!mountedRef.current) {
        resolve(false);
        return;
      }
      const timerId = window.setTimeout(() => {
        retryTimersRef.current.delete(timerId);
        resolve(mountedRef.current);
      }, delayMs);
      retryTimersRef.current.set(timerId, resolve);
    });
  }, []);

  const refreshAccess = async () => {
    await loadStatus();
    return refreshEntitlementWithRetries(onRefresh, waitForRetry);
  };

  const handlePaywall = async () => {
    const runId = paywallRunRef.current + 1;
    paywallRunRef.current = runId;
    setAction("paywall");
    if (paywallOpeningTimerRef.current !== null) {
      window.clearTimeout(paywallOpeningTimerRef.current);
    }
    paywallOpeningTimerRef.current = window.setTimeout(() => {
      paywallOpeningTimerRef.current = null;
      if (mountedRef.current && paywallRunRef.current === runId) {
        setAction(null);
      }
    }, PAYWALL_OPENING_STATE_MS);
    try {
      const outcome = await presentPaywall();
      if (!mountedRef.current || paywallRunRef.current !== runId) return;
      if (outcome === "purchased" || outcome === "restored") {
        const accessReady = await refreshAccess();
        if (!mountedRef.current) return;
        if (accessReady) {
          toast.success(outcome === "purchased" ? "Subscription activated" : "Purchases restored");
        } else {
          toast.info("Purchase confirmed. Lyte and sync are still activating.");
        }
      } else if (outcome === "error" || outcome === "not_presented") {
        toast.error("Unable to open subscription plans");
      } else if (outcome === "cancelled") {
        // The RevenueCat Capacitor plugin can report dismissal before its
        // presentation promise settles. Refresh quietly in case a completed
        // purchase propagated through the native entitlement listener first.
        await loadStatus();
        await onRefresh();
      }
    } catch (error) {
      console.error("[subscription] paywall failed", error);
      if (mountedRef.current && paywallRunRef.current === runId) {
        toast.error("Unable to open subscription plans");
      }
    } finally {
      if (paywallRunRef.current === runId) {
        if (paywallOpeningTimerRef.current !== null) {
          window.clearTimeout(paywallOpeningTimerRef.current);
          paywallOpeningTimerRef.current = null;
        }
        if (mountedRef.current) setAction(null);
      }
    }
  };

  const handleManage = async () => {
    setAction("manage");
    try {
      await presentCustomerCenter();
      if (!mountedRef.current) return;
      await loadStatus();
      await onRefresh();
    } catch (error) {
      console.error("[subscription] customer center failed", error);
      if (mountedRef.current) toast.error("Unable to open subscription management");
    } finally {
      if (mountedRef.current) setAction(null);
    }
  };

  const handleRestore = async () => {
    setAction("restore");
    try {
      const restored = await restorePurchases();
      if (!mountedRef.current) return;
      if (restored) {
        const accessReady = await refreshAccess();
        if (!mountedRef.current) return;
        if (accessReady) {
          toast.success("Purchases restored");
        } else {
          toast.info("Purchase restored. Lyte and sync are still activating.");
        }
      } else {
        toast.info("No active subscription was found");
      }
    } catch (error) {
      console.error("[subscription] restore failed", error);
      if (mountedRef.current) toast.error("Unable to restore purchases");
    } finally {
      if (mountedRef.current) setAction(null);
    }
  };

  const active = status?.proActive || isPro;
  const planName = getSubscriptionPlanName(status?.productId ?? null);
  const serverAccessPending = Boolean(status?.proActive && !isPro);
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
                ? serverAccessPending
                  ? "Purchase confirmed. Lyte and sync are still activating."
                  : renewalDate
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
          <p className="text-xs text-muted-foreground">
            Apple subscriptions can be purchased and managed in NoticoMax on iPhone or iPad.
          </p>
        )}

        <div className="flex flex-wrap gap-x-4 border-t pt-1 text-xs text-muted-foreground">
          <PublicLink
            href="https://noticomax.com/pricing"
            native={isIOSBilling}
            className="inline-flex min-h-11 items-center gap-1.5 hover:text-foreground"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            Plan details
          </PublicLink>
          <PublicLink
            href="https://noticomax.com/terms"
            native={isIOSBilling}
            className="inline-flex min-h-11 items-center hover:text-foreground"
          >
            Terms of Use
          </PublicLink>
          <PublicLink
            href="https://noticomax.com/privacy"
            native={isIOSBilling}
            className="inline-flex min-h-11 items-center hover:text-foreground"
          >
            Privacy Policy
          </PublicLink>
        </div>
      </CardContent>
    </Card>
  );
}
