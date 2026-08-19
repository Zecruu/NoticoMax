import type { LocalItem } from "@/lib/db/indexed-db";

export type ReminderGroupId = "all" | "week" | "month" | "upcoming" | "completed";

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}
function reminderTime(item: LocalItem): number | null {
  if (!item.reminderDate) return null;
  const value = new Date(item.reminderDate).getTime();
  return Number.isNaN(value) ? null : value;
}

export function filterRemindersByGroup(
  items: LocalItem[],
  group: ReminderGroupId,
  now = new Date(),
): LocalItem[] {
  const today = startOfDay(now);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);

  return items
    .filter((item) => {
      if (item.type !== "reminder") return false;
      if (group === "all") return true;
      if (group === "completed") return !!item.reminderCompleted;
      if (item.reminderCompleted) return false;

      const time = reminderTime(item);
      if (time === null) return false;
      if (group === "week") return time >= today.getTime() && time < nextWeek.getTime();
      if (group === "month") return time >= today.getTime() && time < nextMonth.getTime();
      return time >= today.getTime();
    })
    .sort((a, b) => {
      if (!!a.reminderCompleted !== !!b.reminderCompleted) {
        return a.reminderCompleted ? 1 : -1;
      }
      const aTime = reminderTime(a) ?? Number.POSITIVE_INFINITY;
      const bTime = reminderTime(b) ?? Number.POSITIVE_INFINITY;
      if (aTime !== bTime) return aTime - bTime;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
}
