import { CalendarDays, Repeat2 } from "lucide-react";
import type { LocalItem } from "@/lib/db/indexed-db";
import { reminderDateLabel, reminderTiming } from "@/lib/items/reminder-schedule";
import { cn } from "@/lib/utils";

export function ReminderSchedule({ item, now = new Date() }: {
  item: Pick<LocalItem, "reminderDate" | "recurrence" | "reminderCompleted">;
  now?: Date;
}) {
  const timing = reminderTiming(item, now);
  return (
    <span data-reminder-schedule className="mt-3 flex items-start gap-2.5">
      <CalendarDays aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", timing.overdue ? "text-destructive" : "text-muted-foreground")} />
      <span className="min-w-0 space-y-1">
        {timing.date ? (
          <time dateTime={timing.date.toISOString()} className="block">
            <span className={cn("block text-sm font-semibold leading-6", timing.overdue ? "text-destructive" : timing.completed ? "text-muted-foreground" : "text-foreground")}>
              {reminderDateLabel(timing, now)}
            </span>
            <span className={cn("block text-sm leading-5", timing.completed ? "text-muted-foreground" : "text-foreground")}>
              {timing.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
            </span>
          </time>
        ) : <span className="block text-sm font-medium leading-6 text-muted-foreground">No date set</span>}
        <span className="flex items-center gap-1.5 text-xs leading-5 text-muted-foreground">
          {timing.repeating && <Repeat2 aria-hidden="true" className="size-3.5 shrink-0" />}
          {timing.repeatLabel}
        </span>
      </span>
    </span>
  );
}
