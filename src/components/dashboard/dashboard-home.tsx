"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@/lib/db/indexed-db";
import { PlanStatusCard } from "@/components/billing/plan-status-card";
import {
  FileText,
  Link2,
  Bell,
  Calendar,
  Wallet,
  Target,
  MapPin,
  Lock,
  HeartHandshake,
  Plus,
  ArrowUpRight,
  ChevronRight,
  Bot,
  type LucideIcon,
} from "lucide-react";

interface DashboardHomeProps {
  noteCount: number;
  urlCount: number;
  reminderCount: number;
  upcomingReminderCount: number;
  onOpenNotes: () => void;
  onOpenUrls: () => void;
  onOpenReminders: () => void;
  onOpenCalendar: () => void;
  onOpenBudget: () => void;
  onOpenGoals: () => void;
  onOpenLocations: () => void;
  onOpenPasswords: () => void;
  onOpenFamily: () => void;
  onCreateNew: () => void;
  familyPlanActive?: boolean;
}

interface NavigationRowProps {
  icon: LucideIcon;
  label: string;
  count?: string;
  sub?: string;
  onClick: () => void;
}

function NavigationRow({ icon: Icon, label, count, sub, onClick }: NavigationRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-16 w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {sub && <span className="mt-0.5 block text-xs text-muted-foreground">{sub}</span>}
      </div>
      {count !== undefined && <span className="text-sm tabular-nums text-muted-foreground">{count}</span>}
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/70" />
    </button>
  );
}

export function DashboardHome({
  noteCount,
  urlCount,
  reminderCount,
  upcomingReminderCount,
  onOpenNotes,
  onOpenUrls,
  onOpenReminders,
  onOpenCalendar,
  onOpenBudget,
  onOpenGoals,
  onOpenLocations,
  onOpenPasswords,
  onOpenFamily,
  onCreateNew,
  familyPlanActive,
}: DashboardHomeProps) {
  // Lightweight counts pulled directly from Dexie. Reactive — they update
  // as the user adds/removes things without a manual refresh.
  const goalCount = useLiveQuery(
    () => db.goals.filter((goal) => !goal.deleted && !goal.completed).count(),
    [],
    0,
  );
  const locationCount = useLiveQuery(
    () => db.locations.filter((location) => !location.deleted).count(),
    [],
    0,
  );

  // Spend in the current month — gives the Budget tile a live number
  // instead of just an "Open" affordance.
  const monthSpend = useLiveQuery(
    async () => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const txs = await db.budgetTransactions.where("date").startsWith(monthKey).toArray();
      return txs
        .filter((t) => !t.deleted && t.date.slice(0, 7) === monthKey)
        .reduce((s, t) => s + t.amount, 0);
    },
    [],
    0,
  );

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 5) return "Up late";
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-5 py-7 md:px-8 md:py-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{greeting}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">What&apos;s on your mind?</p>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <Plus className="h-4 w-4" />
          New Note
        </button>
      </div>

      <PlanStatusCard />

      <Link href="/assistant" prefetch={true} className="flex min-h-20 items-center gap-4 rounded-xl bg-muted/60 px-4 py-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <Bot aria-hidden="true" className="size-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Ask Lyte</span>
          <span className="mt-1 block text-sm text-muted-foreground">Find something. Remember something.</span>
        </div>
        <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </Link>

      <div className="grid gap-8 md:grid-cols-2 md:gap-10">
        <section aria-labelledby="library-heading">
          <h2 id="library-heading" className="mb-2 px-3 text-sm font-semibold">Your library</h2>
          <div className="divide-y divide-border/60">
        <NavigationRow
          icon={FileText}
          label="Notes"
          count={String(noteCount)}
          onClick={onOpenNotes}
        />
        <NavigationRow
          icon={Bell}
          label="Reminders"
          count={String(reminderCount)}
          sub={upcomingReminderCount > 0 ? `${upcomingReminderCount} upcoming` : undefined}
          onClick={onOpenReminders}
        />
        <NavigationRow
          icon={Link2}
          label="Links"
          count={String(urlCount)}
          onClick={onOpenUrls}
        />
          </div>
        </section>
        <section aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="mb-2 px-3 text-sm font-semibold">Everyday tools</h2>
          <div className="grid grid-cols-2 gap-x-2 md:grid-cols-1">
        <NavigationRow
          icon={Calendar}
          label="Calendar"
          sub={upcomingReminderCount > 0 ? `${upcomingReminderCount} this week` : undefined}
          onClick={onOpenCalendar}
        />
        <NavigationRow
          icon={Wallet}
          label="Budget"
          sub={`$${monthSpend?.toFixed(0) ?? "0"} this month`}
          onClick={onOpenBudget}
        />
        <NavigationRow
          icon={Target}
          label="Goals"
          sub={goalCount ? `${goalCount} active` : undefined}
          onClick={onOpenGoals}
        />
        <NavigationRow
          icon={MapPin}
          label="Locations"
          sub={locationCount ? `${locationCount} saved` : undefined}
          onClick={onOpenLocations}
        />
        <NavigationRow
          icon={Lock}
          label="Passwords"
          onClick={onOpenPasswords}
        />
        {familyPlanActive && (
          <NavigationRow
            icon={HeartHandshake}
            label="Family"
            onClick={onOpenFamily}
          />
        )}
          </div>
        </section>
      </div>
    </div>
  );
}
