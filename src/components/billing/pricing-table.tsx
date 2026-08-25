"use client";

import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PLAN_COMPARISON, PLANS, type PlanId } from "@/lib/billing/plans";

interface PricingTableProps {
  currentPlanId?: PlanId;
  onSelectPlan?: (planId: PlanId) => void;
  selectingPlanId?: PlanId | null;
}

export function PricingTable({
  currentPlanId,
  onSelectPlan,
  selectingPlanId,
}: PricingTableProps) {
  return (
    <div className="space-y-10">
      <div className="grid gap-4 md:grid-cols-3">
        {PLANS.map((plan) => {
          const current = currentPlanId === plan.id;
          const selecting = selectingPlanId === plan.id;
          return (
            <article
              key={plan.id}
              className={cn(
                "relative flex flex-col rounded-2xl border bg-card p-6 shadow-sm",
                plan.highlighted && "border-primary ring-2 ring-primary/20",
              )}
            >
              {plan.highlighted && (
                <Badge className="absolute -top-2.5 left-6">Most popular</Badge>
              )}
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
              </div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-3xl font-bold tracking-tight">{plan.priceLabel}</span>
                {plan.pricePeriod && (
                  <span className="text-sm text-muted-foreground">{plan.pricePeriod}</span>
                )}
              </div>
              {plan.priceNote && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                  {plan.priceNote}
                </p>
              )}
              <ul className="mt-5 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              {current ? (
                <Button className="mt-6 w-full" variant="outline" disabled>
                  Current plan
                </Button>
              ) : plan.id === "free" ? (
                <Button className="mt-6 w-full" variant="outline" asChild>
                  <Link href="/">{plan.ctaLabel}</Link>
                </Button>
              ) : onSelectPlan ? (
                <Button
                  className="mt-6 w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  disabled={selecting}
                  onClick={() => onSelectPlan(plan.id)}
                >
                  {selecting ? "Opening…" : plan.ctaLabel}
                </Button>
              ) : (
                <Button
                  className="mt-6 w-full"
                  variant={plan.highlighted ? "default" : "outline"}
                  asChild
                >
                  <Link href="/">{plan.ctaLabel}</Link>
                </Button>
              )}
            </article>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b text-left">
              <th className="px-4 py-3 font-medium">What you get</th>
              {PLANS.map((plan) => (
                <th key={plan.id} className="px-4 py-3 font-medium">
                  {plan.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PLAN_COMPARISON.map((row) => (
              <tr key={row.label} className="border-b last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{row.label}</td>
                <ComparisonCell included={row.free} />
                <ComparisonCell included={row.pro} />
                <ComparisonCell included={row.family} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ComparisonCell({ included }: { included: boolean }) {
  return (
    <td className="px-4 py-3">
      {included ? (
        <Check className="h-4 w-4 text-primary" aria-label="Included" />
      ) : (
        <Minus className="h-4 w-4 text-muted-foreground/50" aria-label="Not included" />
      )}
    </td>
  );
}
