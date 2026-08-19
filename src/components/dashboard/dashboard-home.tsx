"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db from "@/lib/db/indexed-db";
import {
  Bell,
  Bot,
  Calendar,
  ChevronRight,
  FileText,
  HeartHandshake,
  Link2,
  Lock,
  MapPin,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";

interface DashboardHomeProps {
  noteCount: number;
  urlCount: number;
  reminderCount: number;
  upcomingReminderCount: number;
  onOpenAssistant: () => void;
  onOpenNotes: () => void;
  onOpenUrls: () => void;
  onOpenReminders: () => void;
  onOpenCalendar: () => void;
  onOpenBudget: () => void;
  onOpenGoals: () => void;
  onOpenLocations: () => void;
  onOpenPasswords: () => void;
  onOpenFamily: () => void;
  familyPlanActive?: boolean;
}

interface Destination {
  icon: LucideIcon;
  label: string;
  detail: string;
  count: string;
  accent: string;
  onClick: () => void;
}

function DestinationRow({ icon: Icon, label, detail, count, accent, onClick }: Destination) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:px-4"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-5 w-5" style={{ color: accent }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{detail}</span>
      </span>
      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{count}</span>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
    </button>
  );
}

function DestinationSection({ title, items }: { title: string; items: Destination[] }) {
  const sectionId = `home-${title.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <section className="space-y-2" aria-labelledby={sectionId}>
      <h2 id={sectionId} className="px-4 text-xs font-medium uppercase text-muted-foreground md:px-0">
        {title}
      </h2>
      <div className="divide-y border-y bg-muted/15 md:overflow-hidden md:rounded-lg md:border">
        {items.map((item) => <DestinationRow key={item.label} {...item} />)}
      </div>
    </section>
  );
}

export function DashboardHome({
  noteCount,
  urlCount,
  reminderCount,
  upcomingReminderCount,
  onOpenAssistant,
  onOpenNotes,
  onOpenUrls,
  onOpenReminders,
  onOpenCalendar,
  onOpenBudget,
  onOpenGoals,
  onOpenLocations,
  onOpenPasswords,
  onOpenFamily,
  familyPlanActive,
}: DashboardHomeProps) {
  const dashboardItems = useLiveQuery(
    () => db.items.filter((item) => !item.deleted).toArray(),
    [],
  );
  const liveCounts = useMemo(() => {
    if (!dashboardItems) return null;
    return dashboardItems.reduce(
      (counts, item) => {
        if (item.type in counts) counts[item.type as keyof typeof counts] += 1;
        return counts;
      },
      { note: 0, url: 0, reminder: 0, credential: 0, envvar: 0 },
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

  const resolvedNoteCount = liveCounts?.note ?? noteCount;
  const resolvedUrlCount = liveCounts?.url ?? urlCount;
  const resolvedReminderCount = liveCounts?.reminder ?? reminderCount;
  const passwordCount = liveCounts?.credential ?? 0;
  const savedItemCount = resolvedNoteCount + resolvedUrlCount + resolvedReminderCount;
  const formattedSpend = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(monthSpend ?? 0);

  const primaryDestinations: Destination[] = [
    { icon: Bot, label: "Lyte", detail: "Assistant and reminders", count: "Open", accent: "#8b5cf6", onClick: onOpenAssistant },
    { icon: FileText, label: "Notes", detail: "Folders and writing", count: String(resolvedNoteCount), accent: "#3b82f6", onClick: onOpenNotes },
    { icon: Link2, label: "URLs", detail: "Saved bookmarks", count: String(resolvedUrlCount), accent: "#06b6d4", onClick: onOpenUrls },
    { icon: Bell, label: "Reminders", detail: "Tasks and alerts", count: String(resolvedReminderCount), accent: "#f97316", onClick: onOpenReminders },
    { icon: Calendar, label: "Calendar", detail: "Due in the next 7 days", count: String(upcomingReminderCount), accent: "#8b5cf6", onClick: onOpenCalendar },
  ];
  const utilityDestinations: Destination[] = [
    { icon: Wallet, label: "Budget", detail: "Spent this month", count: formattedSpend, accent: "#22c55e", onClick: onOpenBudget },
    { icon: Lock, label: "Passwords", detail: "Saved credentials", count: String(passwordCount), accent: "#6b7280", onClick: onOpenPasswords },
    { icon: Target, label: "Goals", detail: "Active goals", count: String(goalCount ?? 0), accent: "#ec4899", onClick: onOpenGoals },
    { icon: MapPin, label: "Locations", detail: "Saved places", count: String(locationCount ?? 0), accent: "#eab308", onClick: onOpenLocations },
    ...(familyPlanActive
      ? [{ icon: HeartHandshake, label: "Family", detail: "Shared household", count: "Open", accent: "#ef4444", onClick: onOpenFamily }]
      : []),
  ];

  return (
    <div className="pb-4 md:p-6">
      <div className="flex min-h-16 items-center px-4 py-3 md:px-0 md:pt-0">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">Home</h1>
          <p className="text-xs text-muted-foreground">
            {savedItemCount} {savedItemCount === 1 ? "saved item" : "saved items"}
          </p>
        </div>
      </div>
      <div className="space-y-6 md:max-w-3xl">
        <DestinationSection title="Library" items={primaryDestinations} />
        <DestinationSection title="More" items={utilityDestinations} />
      </div>
    </div>
  );
}
