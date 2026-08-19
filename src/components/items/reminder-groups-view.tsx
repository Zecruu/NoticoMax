"use client";

import { Bell, CalendarDays, CalendarRange, CheckCircle2, ChevronRight, Clock3, Plus } from "lucide-react";
import type { LocalItem } from "@/lib/db/indexed-db";
import { filterRemindersByGroup, type ReminderGroupId } from "@/lib/reminder-groups";
import { Button } from "@/components/ui/button";

interface ReminderGroupsViewProps {
  items: LocalItem[];
  loading: boolean;
  onOpenGroup: (group: ReminderGroupId) => void;
  onCreateReminder: () => void;
}
const GROUPS: Array<{
  id: ReminderGroupId;
  label: string;
  icon: typeof Bell;
  color: string;
}> = [
  { id: "all", label: "All reminders", icon: Bell, color: "#3b82f6" },
  { id: "week", label: "This week", icon: CalendarDays, color: "#f59e0b" },
  { id: "month", label: "This month", icon: CalendarRange, color: "#8b5cf6" },
  { id: "upcoming", label: "Upcoming", icon: Clock3, color: "#14b8a6" },
  { id: "completed", label: "Completed", icon: CheckCircle2, color: "#22c55e" },
];

export const REMINDER_GROUP_LABELS: Record<ReminderGroupId, string> = Object.fromEntries(
  GROUPS.map((group) => [group.id, group.label]),
) as Record<ReminderGroupId, string>;

export function ReminderGroupsView({
  items,
  loading,
  onOpenGroup,
  onCreateReminder,
}: ReminderGroupsViewProps) {
  const reminderCount = items.filter((item) => item.type === "reminder").length;

  return (
    <div className="pb-4 md:p-6">
      <div className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 md:px-0 md:pt-0">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold md:text-3xl">Reminders</h1>
          <p className="text-xs text-muted-foreground">
            {loading ? "Loading…" : `${reminderCount} ${reminderCount === 1 ? "reminder" : "reminders"}`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={onCreateReminder}
          aria-label="New reminder"
          title="New reminder"
        >
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <section className="space-y-2" aria-labelledby="reminder-smart-lists">
        <h2
          id="reminder-smart-lists"
          className="px-4 text-xs font-medium uppercase text-muted-foreground md:px-0"
        >
          Smart lists
        </h2>
        <div className="divide-y border-y bg-muted/15 md:max-w-3xl md:overflow-hidden md:rounded-lg md:border">
          {loading
            ? Array.from({ length: GROUPS.length }).map((_, index) => (
                <div key={index} className="h-14 animate-pulse bg-muted/40" />
              ))
            : GROUPS.map((group) => {
                const Icon = group.icon;
                const count = filterRemindersByGroup(items, group.id).length;
                return (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => onOpenGroup(group.id)}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-5 w-5" style={{ color: group.color }} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-base font-medium">{group.label}</span>
                    <span className="text-sm tabular-nums text-muted-foreground">{count}</span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                  </button>
                );
              })}
        </div>
      </section>
    </div>
  );
}
