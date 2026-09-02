"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLicense } from "@/hooks/use-license";
import { isIOS } from "@/lib/platform";
import { purchaseLytePack } from "@/lib/iap/revenuecat-client";
import { toast } from "@/lib/native-toast";
import { cn } from "@/lib/utils";
import type { LyteMeterKind } from "@/lib/billing/plans";
import Link from "next/link";

interface Meter {
  kind: LyteMeterKind;
  used: number;
  planAllowance: number;
  extraRemaining: number;
  remaining: number;
}

interface Pack {
  productId: string;
  kind: LyteMeterKind;
  amount: number;
  usd: number;
  name: string;
  description: string;
}

interface UsagePayload {
  planId: string;
  planName: string;
  chats: Meter;
  lookups: Meter;
  packs: Pack[];
}

function MeterBar({ label, meter }: { label: string; meter: Meter }) {
  const cap = meter.planAllowance + meter.extraRemaining;
  const percent = cap > 0 ? Math.min(100, (meter.used / Math.max(meter.planAllowance, 1)) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {meter.used.toLocaleString()} / {meter.planAllowance.toLocaleString()} this month
          {meter.extraRemaining > 0
            ? ` · ${meter.extraRemaining.toLocaleString()} extra`
            : ""}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all",
            percent >= 100 ? "bg-destructive" : percent >= 80 ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${meter.planAllowance === 0 ? 0 : percent}%` }}
        />
      </div>
    </div>
  );
}

export function LyteUsageCard() {
  const { isLoggedIn } = useLicense();
  const [data, setData] = useState<UsagePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [iosBilling, setIosBilling] = useState(false);

  useEffect(() => {
    setIosBilling(isIOS());
  }, []);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/assistant/usage", { credentials: "include" });
      if (!res.ok) {
        setData(null);
        return;
      }
      setData((await res.json()) as UsagePayload);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleBuy(pack: Pack) {
    if (!iosBilling) return;
    setBuying(pack.productId);
    try {
      const result = await purchaseLytePack(pack.productId);
      if (result === "cancelled") return;
      if (result === "purchased") {
        toast.success(`${pack.name} purchased. Extra ${pack.kind} will show up in a moment.`);
        window.setTimeout(() => {
          void refresh();
        }, 1500);
      }
    } catch (error) {
      console.error("[lyte-usage] purchase failed", error);
      toast.error("Could not complete the purchase.");
    } finally {
      setBuying(null);
    }
  }

  const paid = data && data.planId !== "free";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" />
          Lyte usage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading usage…</p>
        ) : !isLoggedIn ? (
          <p className="text-sm text-muted-foreground">Sign in to see Lyte usage.</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Could not load Lyte usage.</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {paid
                ? `${data.planName} includes monthly Lyte chats and web lookups. Extra packs stay until you use them.`
                : "Lyte chats and web lookups come with Pro, Platinum, or MAXXED. Extra packs are sold on iPhone."}
            </p>
            <MeterBar label="Chats" meter={data.chats} />
            <MeterBar label="Web lookups" meter={data.lookups} />

            {iosBilling && (
              <div className="space-y-2 border-t pt-3">
                <p className="text-sm font-medium">Buy extra</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {data.packs.map((pack) => (
                    <Button
                      key={pack.productId}
                      variant="outline"
                      size="sm"
                      className="h-auto justify-start py-2"
                      disabled={buying !== null}
                      onClick={() => void handleBuy(pack)}
                    >
                      <span className="flex w-full flex-col items-start text-left">
                        <span>{buying === pack.productId ? "Purchasing…" : pack.name}</span>
                        <span className="text-[11px] font-normal text-muted-foreground">
                          ${pack.usd.toFixed(2)}
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {!paid && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/pricing">See plans</Link>
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
