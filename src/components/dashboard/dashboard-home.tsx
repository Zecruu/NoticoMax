"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, { type LocalItem } from "@/lib/db/indexed-db";
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
  ChevronRight,
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
  onOpenItem: (item: LocalItem) => void;
  onCreateNew: () => void;
  familyPlanActive?: boolean;
}

interface DestinationProps {
  icon: LucideIcon;
  label: string;
  count: string;
  accent: string;
  onClick: () => void;
}

function PrimaryDestination({ icon: Icon, label, count, accent, onClick }: DestinationProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-24 flex-col justify-between rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted"
    >
      <span
        className="flex h-9 w-9 items-center justify-center rounded-md"
        style={{ backgroundColor: `${accent}1a`, color: accent }}
      >
        <Icon className="h-4.5 w-4.5" />
      </span>
      <span className="flex w-full items-end justify-between gap-1.5">
        <span className="min-w-0 truncate text-xs font-medium md:text-sm">{label}</span>
        <span className="shrink-0 text-lg font-semibold tabular-nums md:text-xl">{count}</span>
      </span>
    </button>
  );
}

interface SecondaryDestinationProps {
  icon: LucideIcon;
  label: string;
  accent: string;
  onClick: () => void;
}

function SecondaryDestination({ icon: Icon, label, accent, onClick }: SecondaryDestinationProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-md px-1 py-2 text-center transition-colors hover:bg-muted active:bg-muted"
    >
      <Icon className="h-5 w-5" style={{ color: accent }} />
      <span className="w-full text-[11px] font-medium leading-tight text-foreground">{label}</span>
    </button>
  );
}

function formatRecentDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function notePreview(item: LocalItem): string {
  return item.content
    .split("\n")
    .map((line) => line.replace(/^(?:- \[[ xX]\] |- |\d+\. |[a-z]\. |#+\s+)/, "").trim())
    .filter(Boolean)
    .join(" ");
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
  onOpenItem,
  onCreateNew,
  familyPlanActive,
}: DashboardHomeProps) {
  const dashboardItems = useLiveQuery(
    () => db.items.filter((item) => !item.deleted).toArray(),
    [],
  );
  const recentNotes = useMemo(
    () =>
      (dashboardItems ?? [])
        .filter((item) => item.type === "note")
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, 4),
    [dashboardItems],
  );
  const liveCounts = useMemo(() => {
    if (!dashboardItems) return null;
    return dashboardItems.reduce(
      (counts, item) => {
        if (item.type === "note" || item.type === "url" || item.type === "reminder") {
          counts[item.type] += 1;
        }
        return counts;
      },
      { note: 0, url: 0, reminder: 0 },
    );
  }, [dashboardItems]);

  const goalCount = useLiveQuery(
    () => db.goals.toArray().then((goals) => goals.filter((goal) => !goal.deleted && !goal.completed).length),
    [],
    0,
  );
  const locationCount = useLiveQuery(
    () => db.locations.toArray().then((locations) => locations.filter((location) => !location.deleted).length),
    [],
    0,
  );
  const monthSpend = useLiveQuery(
    async () => {
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const transactions = await db.budgetTransactions.toArray();
      return transactions
        .filter((transaction) => !transaction.deleted && transaction.date.slice(0, 7) === monthKey)
        .reduce((sum, transaction) => sum + transaction.amount, 0);
    },
    [],
    0,
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return "Up late";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  const resolvedNoteCount = liveCounts?.note ?? noteCount;
  const resolvedUrlCount = liveCounts?.url ?? urlCount;
  const resolvedReminderCount = liveCounts?.reminder ?? reminderCount;
  const secondaryDestinations = [
    { icon: Calendar, label: "Calendar", accent: "#8b5cf6", onClick: onOpenCalendar },
    { icon: Wallet, label: "Budget", accent: "#22c55e", onClick: onOpenBudget },
    { icon: Target, label: "Goals", accent: "#ec4899", onClick: onOpenGoals },
    { icon: MapPin, label: "Locations", accent: "#eab308", onClick: onOpenLocations },
    { icon: Lock, label: "Passwords", accent: "#6b7280", onClick: onOpenPasswords },
    ...(familyPlanActive
      ? [{ icon: HeartHandshake, label: "Family", accent: "#ef4444", onClick: onOpenFamily }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-7 px-4 py-5 md:px-8 md:py-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold md:text-2xl">{greeting}</h1>
        <button
          type="button"
          onClick={onCreateNew}
          className="hidden h-10 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 active:bg-primary/80 md:inline-flex"
        >
          <Plus className="h-4 w-4" />
          New Note
        </button>
      </div>

      <section aria-label="Primary destinations">
        <div className="grid grid-cols-3 gap-2.5 md:gap-4">
          <PrimaryDestination icon={FileText} label="Notes" count={String(resolvedNoteCount)} accent="#3b82f6" onClick={onOpenNotes} />
          <PrimaryDestination icon={Bell} label="Reminders" count={String(resolvedReminderCount)} accent="#f97316" onClick={onOpenReminders} />
          <PrimaryDestination icon={Link2} label="URLs" count={String(resolvedUrlCount)} accent="#06b6d4" onClick={onOpenUrls} />
        </div>
      </section>

      <section aria-labelledby="recent-notes-title">
        <div className="mb-2 flex min-h-11 items-center justify-between">
          <div>
            <h2 id="recent-notes-title" className="text-base font-semibold">Recent notes</h2>
            <p className="text-xs text-muted-foreground">Continue where you left off</p>
          </div>
          <button type="button" onClick={onOpenNotes} className="flex h-11 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            See all
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        {recentNotes.length > 0 ? (
          <div className="divide-y border-y md:rounded-lg md:border">
            {recentNotes.map((item) => {
              const preview = notePreview(item);
              return (
                <button key={item.clientId} type="button" onClick={() => onOpenItem(item)} className="flex min-h-16 w-full items-center gap-3 px-1 py-3 text-left transition-colors hover:bg-muted/50 active:bg-muted md:px-3">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      {item.pinned && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />}
                      <span className="truncate text-sm font-medium">{item.title || "Untitled note"}</span>
                    </span>
                    <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="shrink-0">{formatRecentDate(item.updatedAt)}</span>
                      {preview && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="truncate">{preview}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        ) : (
          <button type="button" onClick={onCreateNew} className="flex min-h-16 w-full items-center justify-between border-y px-1 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/50 md:rounded-lg md:border md:px-3">
            Start your first note
            <Plus className="h-4 w-4" />
          </button>
        )}
      </section>

      <section aria-labelledby="more-destinations-title">
        <div className="mb-2 flex items-center justify-between">
          <h2 id="more-destinations-title" className="text-base font-semibold">More</h2>
          {upcomingReminderCount > 0 && <span className="text-xs text-muted-foreground">{upcomingReminderCount} due this week</span>}
        </div>
        <div className={cn("grid grid-cols-5 gap-1", familyPlanActive && "grid-cols-3 sm:grid-cols-6")}>
          {secondaryDestinations.map((destination) => <SecondaryDestination key={destination.label} {...destination} />)}
        </div>
        <span className="sr-only">${Math.round(monthSpend ?? 0)} spent this month; {goalCount ?? 0} active goals; {locationCount ?? 0} saved locations.</span>
      </section>
    </div>
  );
}
