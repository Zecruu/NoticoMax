"use client";

import { useState, useMemo } from "react";
import { type LocalItem } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarViewProps {
  items: LocalItem[];
  onEdit: (item: LocalItem) => void;
  onToggleComplete: (clientId: string, completed: boolean) => void;
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

export function CalendarView({ items, onEdit, onToggleComplete }: CalendarViewProps) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  // Map dates to items
  const dateItemMap = useMemo(() => {
    const map = new Map<string, LocalItem[]>();
    for (const item of items) {
      if (!item.reminderDate) continue;
      const d = new Date(item.reminderDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return map;
  }, [items]);

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
          <h3 className="text-sm font-medium text-muted-foreground">
            {selectedDate.toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </h3>

          {selectedItems.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">
              No reminders for this day
            </p>
          ) : (
            <div className="space-y-2">
              {selectedItems.map((item) => (
                <div
                  key={item.clientId}
                  className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => onEdit(item)}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleComplete(item.clientId, !!item.reminderCompleted);
                    }}
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
                    {item.content && (
                      <p className="text-xs text-muted-foreground truncate">
                        {item.content}
                      </p>
                    )}
                  </div>
                  {item.tags.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {item.tags[0]}
                    </Badge>
                  )}
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
        </div>
      )}
    </div>
  );
}
