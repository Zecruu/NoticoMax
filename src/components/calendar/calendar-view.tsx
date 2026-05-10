"use client";

import { useState, useMemo } from "react";
import { type LocalItem } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Calendar, Plus, Pencil, Trash2, Clock, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  items: LocalItem[];
  onEdit: (item: LocalItem) => void;
  onDelete?: (clientId: string) => void;
  onToggleComplete: (clientId: string, completed: boolean) => void;
  onCreateReminder?: (date?: Date) => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function CalendarView({ items, onEdit, onDelete, onToggleComplete, onCreateReminder }: CalendarViewProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Map dates to items. For recurring items, expand into virtual occurrences
  // across the visible month — the original LocalItem reference is reused
  // (no clone) so edit/complete/delete still target the source row.
  const dateItemMap = useMemo(() => {
    const map = new Map<string, LocalItem[]>();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    const push = (d: Date, item: LocalItem) => {
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    };

    for (const item of items) {
      if (!item.reminderDate) continue;
      const start = new Date(item.reminderDate);
      const rule = item.recurrence ?? "none";

      if (rule === "none") {
        push(start, item);
        continue;
      }

      // Walk forward from `start` by the rule's cadence, dropping any
      // occurrence outside the visible month. Cap at ~400 iterations as a
      // safety net so a malformed item can't lock the loop.
      const cur = new Date(start);
      // Fast-forward `cur` to inside or just before the visible month so we
      // don't iterate years for a daily reminder created long ago.
      if (rule === "daily") {
        if (cur < monthStart) {
          const diffDays = Math.floor((monthStart.getTime() - cur.getTime()) / 86400000);
          cur.setDate(cur.getDate() + diffDays);
        }
      } else if (rule === "weekly") {
        if (cur < monthStart) {
          const diffWeeks = Math.floor((monthStart.getTime() - cur.getTime()) / (86400000 * 7));
          cur.setDate(cur.getDate() + diffWeeks * 7);
        }
      } else if (rule === "monthly") {
        while (cur < monthStart) cur.setMonth(cur.getMonth() + 1);
      } else if (rule === "yearly") {
        while (cur < monthStart) cur.setFullYear(cur.getFullYear() + 1);
      }

      let safety = 0;
      while (cur <= monthEnd && safety++ < 400) {
        if (cur >= monthStart) push(new Date(cur), item);
        if (rule === "daily") cur.setDate(cur.getDate() + 1);
        else if (rule === "weekly") cur.setDate(cur.getDate() + 7);
        else if (rule === "monthly") cur.setMonth(cur.getMonth() + 1);
        else if (rule === "yearly") cur.setFullYear(cur.getFullYear() + 1);
      }
    }
    return map;
  }, [items, currentMonth, currentYear]);

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startPad = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) {
      days.push(new Date(currentYear, currentMonth, d));
    }
    // Pad end to complete the week
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [currentMonth, currentYear]);

  const goToPrev = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  };

  const goToNext = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  };

  const goToToday = () => {
    setCurrentMonth(today.getMonth());
    setCurrentYear(today.getFullYear());
    setSelectedDate(today);
  };

  const selectedItems = useMemo(() => {
    if (!selectedDate) return [];
    const key = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}`;
    return dateItemMap.get(key) || [];
  }, [selectedDate, dateItemMap]);

  function getDotColor(itemsForDay: LocalItem[]) {
    const hasOverdue = itemsForDay.some(
      (i) => !i.reminderCompleted && new Date(i.reminderDate!) < today
    );
    const hasUpcoming = itemsForDay.some(
      (i) => !i.reminderCompleted && new Date(i.reminderDate!) >= today
    );
    const allComplete = itemsForDay.every((i) => i.reminderCompleted);

    if (allComplete) return "bg-green-500";
    if (hasOverdue) return "bg-red-500";
    if (hasUpcoming) return "bg-blue-500";
    return "bg-muted-foreground";
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {MONTHS[currentMonth]} {currentYear}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={goToToday} className="text-xs h-7">
            Today
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToPrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goToNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-px">
        {DAYS.map((day) => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}

        {/* Calendar cells */}
        {calendarDays.map((date, idx) => {
          if (!date) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }

          const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
          const dayItems = dateItemMap.get(key);
          const isToday = isSameDay(date, today);
          const isSelected = selectedDate && isSameDay(date, selectedDate);

          return (
            <button
              key={key}
              onClick={() => setSelectedDate(date)}
              className={cn(
                "aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-colors relative",
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : isToday
                    ? "bg-muted font-semibold"
                    : "hover:bg-muted/50"
              )}
            >
              {date.getDate()}
              {dayItems && dayItems.length > 0 && (
                <div
                  className={cn(
                    "absolute bottom-1 h-1.5 w-1.5 rounded-full",
                    isSelected ? "bg-primary-foreground" : getDotColor(dayItems)
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected date reminders */}
      {selectedDate && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              {selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}
            </h3>
            {onCreateReminder && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-7 text-xs"
                onClick={() => onCreateReminder(selectedDate ?? undefined)}
              >
                <Plus className="h-3 w-3" />
                Add Reminder
              </Button>
            )}
          </div>

          {selectedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">
              No reminders for this day
            </p>
          ) : (
            <div className="space-y-2">
              {selectedItems.map((item) => (
                <div
                  key={item.clientId}
                  className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <button
                    onClick={() => onToggleComplete(item.clientId, !!item.reminderCompleted)}
                    className="shrink-0"
                  >
                    {item.reminderCompleted ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium truncate",
                        item.reminderCompleted && "line-through text-muted-foreground"
                      )}
                    >
                      {item.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.reminderDate && (
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatTime(item.reminderDate)}
                        </span>
                      )}
                      {item.recurrence && item.recurrence !== "none" && (
                        <span className="flex items-center gap-1 text-[11px] text-primary">
                          <Repeat className="h-3 w-3" />
                          {item.recurrence}
                        </span>
                      )}
                      {item.content && (
                        <p className="text-xs text-muted-foreground truncate">
                          {item.content}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.tags.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {item.tags[0]}
                    </Badge>
                  )}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={() => onEdit(item)}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {onDelete && (
                      <button
                        onClick={() => onDelete(item.clientId)}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Empty state when no reminders at all */}
      {items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-sm font-medium text-muted-foreground">No reminders yet</h3>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Create a reminder to see it on the calendar
          </p>
          {onCreateReminder && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => onCreateReminder()}>
              <Plus className="h-3.5 w-3.5" />
              Add Reminder
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
