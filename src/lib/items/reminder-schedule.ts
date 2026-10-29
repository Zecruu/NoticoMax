import type { LocalItem, RecurrenceRule } from "../db/indexed-db.ts";

type Reminder = Pick<LocalItem, "reminderDate" | "recurrence" | "reminderCompleted">;
const DAY = 86_400_000;
const rules = ["daily", "weekly", "monthly", "yearly"];

export const REPEAT_LABELS: Record<RecurrenceRule, string> = {
  none: "Does not repeat",
  daily: "Repeats every day",
  weekly: "Repeats every week",
  monthly: "Repeats every month",
  yearly: "Repeats every year",
};

function validDate(value: string | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Anchor every occurrence to the original local calendar date/time. Clamping
 * short months must not move March 31 to March 28 or a leap birthday forever. */
function occurrence(start: Date, rule: RecurrenceRule, offset: number): Date {
  const date = new Date(start);
  if (rule === "daily" || rule === "weekly") {
    date.setDate(start.getDate() + offset * (rule === "weekly" ? 7 : 1));
  } else {
    const year = start.getFullYear() + (rule === "yearly" ? offset : 0);
    const month = start.getMonth() + (rule === "monthly" ? offset : 0);
    date.setDate(1);
    date.setFullYear(year, month + 1, 0);
    const day = Math.min(start.getDate(), date.getDate());
    date.setDate(day);
  }
  return date;
}

/** First occurrence at or after `from`, without rewriting the saved anchor. */
export function nextReminderDate(
  value: string | undefined,
  rule: RecurrenceRule | undefined,
  from = new Date()
): Date | null {
  const start = validDate(value);
  if (!start || !Number.isFinite(from.getTime())) return null;
  if (!rule || !rules.includes(rule)) return start;
  let offset = 0;
  if (rule === "yearly") offset = from.getFullYear() - start.getFullYear();
  else if (rule === "monthly")
    offset = (from.getFullYear() - start.getFullYear()) * 12 + from.getMonth() - start.getMonth();
  else {
    // Civil dates, rather than elapsed 24-hour periods, keep DST from changing
    // the weekday or wall-clock hour of daily/weekly reminders.
    const days = (Date.UTC(from.getFullYear(), from.getMonth(), from.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / DAY;
    offset = Math.floor(days / (rule === "weekly" ? 7 : 1));
  }
  offset = Math.max(0, offset);
  for (let attempt = 0; attempt < 3; attempt++, offset++) {
    const date = occurrence(start, rule, offset);
    if (!Number.isFinite(date.getTime())) return null;
    if (date >= from) return date;
  }
  return null;
}

export function reminderTiming(item: Reminder, now = new Date()) {
  const rule: RecurrenceRule = item.recurrence && rules.includes(item.recurrence) ? item.recurrence : "none";
  const repeating = rule !== "none";
  const original = validDate(item.reminderDate);
  const date = item.reminderCompleted ? original : nextReminderDate(item.reminderDate, rule, now);
  const overdue = !!date && !repeating && !item.reminderCompleted && date < now;
  return { date, repeating, rule, overdue, completed: !!item.reminderCompleted, repeatLabel: REPEAT_LABELS[rule] };
}

export function reminderDateLabel(timing: ReturnType<typeof reminderTiming>, now = new Date(), locale?: string): string {
  if (!timing.date) return "No date set";
  const day = timing.date.toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  if (timing.completed) return `Completed · ${day}`;
  if (timing.overdue) return `Overdue · ${day}`;
  if (timing.repeating) return `Next · ${day}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (timing.date.toDateString() === now.toDateString()) return `Today · ${day}`;
  if (timing.date.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${day}`;
  return day;
}

/** Calendar expansion shares the same anchored recurrence policy as the list. */
export function reminderOccurrences(value: string, rule: RecurrenceRule | undefined, from: Date, through: Date): Date[] {
  const dates: Date[] = [];
  let date = nextReminderDate(value, rule, from);
  while (date && date >= from && date <= through && dates.length < 400) {
    dates.push(date);
    if (!rule || !rules.includes(rule)) break;
    date = nextReminderDate(value, rule, new Date(date.getTime() + 1));
  }
  return dates;
}
