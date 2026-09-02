"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PricingTable } from "@/components/billing/pricing-table";
import { type PlanId } from "@/lib/billing/plans";
import { isIOS } from "@/lib/platform";
import { presentPaywall } from "@/lib/iap/revenuecat-client";
import { toast } from "@/lib/native-toast";

export default function PricingPage() {
  const [iosBilling, setIosBilling] = useState(false);
  const [selectingPlanId, setSelectingPlanId] = useState<PlanId | null>(null);

  useEffect(() => {
    setIosBilling(isIOS());
  }, []);

  async function handleSelectPlan(planId: PlanId) {
    if (planId === "free") return;
    if (!iosBilling) {
      window.location.href = "/";
      return;
    }
    setSelectingPlanId(planId);
    try {
      const result = await presentPaywall();
      if (result === "purchased" || result === "restored") {
        toast.success(result === "restored" ? "Purchases restored." : "Plan updated.");
      } else if (result === "error") {
        toast.error("Could not open the App Store plans.");
      }
    } catch (error) {
      console.error("[pricing] plan select failed", error);
      toast.error("Could not open plans.");
    } finally {
      setSelectingPlanId(null);
    }
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 md:px-6">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Back to app">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" className="h-6 w-6" />
          <span className="text-sm font-bold tracking-tight">NOTICO MAX</span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/privacy">Privacy</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-8 px-4 py-10 md:px-6 md:py-14">
        <div className="max-w-2xl space-y-3">
          <p className="text-xs font-medium uppercase tracking-wider text-primary">Pricing</p>
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            Plans that match what the app actually unlocks.
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
            Free stays on this device. Paid plans are Pro, Platinum, and MAXXED — each
            unlocks cloud sync, removes ads, and includes a Lyte allowance. iOS charges
            through Apple; desktop and web can activate an existing license in Settings.
          </p>
        </div>

        <PricingTable
          onSelectPlan={handleSelectPlan}
          selectingPlanId={selectingPlanId}
        />

        <section className="grid gap-4 rounded-2xl border bg-card p-6 text-sm md:grid-cols-3">
          <div className="space-y-1">
            <h2 className="font-semibold">iPhone</h2>
            <p className="text-muted-foreground">
              Subscribe in the App Store purchase sheet. Manage or cancel in Apple subscriptions
              or Manage plan in the app.
            </p>
          </div>
          <div className="space-y-1">
            <h2 className="font-semibold">Desktop and web</h2>
            <p className="text-muted-foreground">
              Sign in with the same account. If you already have a product key, activate it in
              Settings. New Pro purchases are completed on iOS.
            </p>
          </div>
          <div className="space-y-1">
            <h2 className="font-semibold">Lyte</h2>
            <p className="text-muted-foreground">
              Chat and web-lookup limits reset each month with your plan. Extra Lyte packs
              are one-time iPhone purchases ($0.99 / $2.99). MAXXED is $34.99 a month;
              Pro and Platinum show their App Store price at checkout.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
