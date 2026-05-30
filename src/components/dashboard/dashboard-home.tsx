"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@/lib/db/indexed-db";
import { cn } from "@/lib/utils";
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

interface TileProps {
  icon: LucideIcon;
  label: string;
  count?: string;
  sub?: string;
  accent: string;
  onClick: () => void;
}

function Tile({ icon: Icon, label, count, sub, accent, onClick }: TileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left",
        "transition-all hover:bg-muted/50 active:scale-[0.98]",
      )}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex w-full items-end justify-between gap-1">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {count !== undefined && (
          <span className="text-2xl font-bold tabular-nums leading-none text-foreground">{count}</span>
        )}
      </div>
      {sub && <span className="text-[11px] text-muted-foreground">{sub}</span>}
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
    () => db.goals.toArray().then((g) => g.filter((x) => !x.deleted && !x.completed).length),
    [],
    0,
  );
  const locationCount = useLiveQuery(
    () => db.locations.toArray().then((l) => l.filter((x) => !x.deleted).length),
    [],
    0,
  );

  // Spend in the current month — gives the Budget tile a live number
  // instead of just an "Open" affordance.
  const monthSpend = useLiveQuery(
    async () => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const txs = await db.budgetTransactions.toArray();
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
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}</h1>
          <p className="text-sm text-muted-foreground">Tap a tile to dive in.</p>
        </div>
        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          New Note
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile
          icon={FileText}
          label="Notes"
          count={String(noteCount)}
          accent="#3b82f6"
          onClick={onOpenNotes}
        />
        <Tile
          icon={Bell}
          label="Reminders"
          count={String(reminderCount)}
          sub={upcomingReminderCount > 0 ? `${upcomingReminderCount} upcoming` : undefined}
          accent="#f97316"
          onClick={onOpenReminders}
        />
        <Tile
          icon={Calendar}
          label="Calendar"
          count={String(upcomingReminderCount)}
          sub="next 7 days"
          accent="#8b5cf6"
          onClick={onOpenCalendar}
        />
        <Tile
          icon={Link2}
          label="URLs"
          count={String(urlCount)}
          accent="#06b6d4"
          onClick={onOpenUrls}
        />
        <Tile
          icon={Wallet}
          label="Budget"
          count={`$${monthSpend?.toFixed(0) ?? "0"}`}
          sub="spent this month"
          accent="#22c55e"
          onClick={onOpenBudget}
        />
        <Tile
          icon={Target}
          label="Goals"
          count={String(goalCount ?? 0)}
          sub="active"
          accent="#ec4899"
          onClick={onOpenGoals}
        />
        <Tile
          icon={MapPin}
          label="Locations"
          count={String(locationCount ?? 0)}
          accent="#eab308"
          onClick={onOpenLocations}
        />
        <Tile
          icon={Lock}
          label="Passwords"
          accent="#6b7280"
          onClick={onOpenPasswords}
        />
        {familyPlanActive && (
          <Tile
            icon={HeartHandshake}
            label="Family"
            accent="#ef4444"
            onClick={onOpenFamily}
          />
        )}
      </div>
    </div>
  );
}
