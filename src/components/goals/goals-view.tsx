"use client";

import { useState } from "react";
import { useGoals, getPeriodKey, formatPeriodKey } from "@/hooks/use-goals";
import { type GoalScope } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Target, Plus, CheckCircle2, Circle, Trash2, Sun, Calendar, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";

const SCOPES: { value: GoalScope; label: string; icon: typeof Sun }[] = [
  { value: "today", label: "Today", icon: Sun },
  { value: "month", label: "This Month", icon: Calendar },
  { value: "year", label: "This Year", icon: Sparkles },
];

function formatCompletedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export function GoalsView() {
  const { goals, addGoal, toggleGoal, deleteGoal } = useGoals();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newScope, setNewScope] = useState<GoalScope>("today");
  const [filterScope, setFilterScope] = useState<GoalScope | "all">("all");

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title) {
      toast.error("Goal can't be empty");
      return;
    }
    await addGoal({ title, scope: newScope });
    setNewTitle("");
    setCreating(false);
    toast.success("Goal added");
  };

  const visibleGoals = filterScope === "all"
    ? goals
    : goals.filter((g) => g.scope === filterScope);

  // Group by scope for display when "all"
  const grouped: Record<GoalScope, typeof goals> = { today: [], month: [], year: [] };
  for (const g of visibleGoals) grouped[g.scope].push(g);

  // Stats
  const total = goals.length;
  const completed = goals.filter((g) => g.completed).length;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Target className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Goals</h1>
          <p className="text-sm text-muted-foreground">
            Set goals for today, this month, or this year. Mark them done as you finish.
          </p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)} className="gap-1.5">
          <Plus className="h-4 w-4" />
          New Goal
        </Button>
      </div>

      {total > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">Total</p>
              <p className="text-2xl font-semibold tabular-nums">{total}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">Completed</p>
              <p className="text-2xl font-semibold tabular-nums text-green-500">{completed}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">In Progress</p>
              <p className="text-2xl font-semibold tabular-nums">{total - completed}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scope filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterScope("all")}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            filterScope === "all"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80",
          )}
        >
          All
        </button>
        {SCOPES.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.value}
              onClick={() => setFilterScope(s.value)}
              className={cn(
                "flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filterScope === s.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              <Icon className="h-3 w-3" />
              {s.label}
            </button>
          );
        })}
      </div>

      {visibleGoals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {goals.length === 0
              ? <>No goals yet. Click <strong>New Goal</strong> to set your first.</>
              : "No goals in this scope."}
          </CardContent>
        </Card>
      ) : filterScope === "all" ? (
        <div className="space-y-6">
          {SCOPES.map((s) => {
            if (grouped[s.value].length === 0) return null;
            const Icon = s.icon;
            return (
              <div key={s.value}>
                <div className="flex items-center gap-2 mb-2 text-sm font-medium text-muted-foreground">
                  <Icon className="h-4 w-4" />
                  {s.label}
                </div>
                <GoalList
                  goals={grouped[s.value]}
                  onToggle={toggleGoal}
                  onDelete={deleteGoal}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <GoalList
          goals={visibleGoals}
          onToggle={toggleGoal}
          onDelete={deleteGoal}
        />
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Goal</DialogTitle>
            <DialogDescription>
              What do you want to accomplish? Pick a timeframe — the goal will be tracked against the
              {newScope === "today" ? ` today (${formatPeriodKey(newScope, getPeriodKey(newScope))})`
                : newScope === "month" ? ` current month (${formatPeriodKey(newScope, getPeriodKey(newScope))})`
                : ` current year (${getPeriodKey("year")})`}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="goal-title">Goal</Label>
              <Input
                id="goal-title"
                placeholder="Read 30 minutes, work out 4 times…"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Timeframe</Label>
              <div className="grid grid-cols-3 gap-2">
                {SCOPES.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setNewScope(s.value)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-md border-2 p-3 text-xs font-medium transition-colors",
                        newScope === s.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-transparent bg-muted text-muted-foreground hover:border-muted-foreground/30",
                      )}
                    >
                      <Icon className="h-5 w-5" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Add Goal</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GoalList({
  goals,
  onToggle,
  onDelete,
}: {
  goals: ReturnType<typeof useGoals>["goals"];
  onToggle: (id: string, completed: boolean) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <div className="space-y-2">
      {goals.map((g) => (
        <Card key={g.clientId} className="overflow-hidden">
          <CardContent className="flex items-center gap-3 py-3">
            <button
              onClick={() => onToggle(g.clientId, g.completed)}
              className="shrink-0"
              aria-label={g.completed ? "Mark incomplete" : "Mark complete"}
            >
              {g.completed
                ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                : <Circle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />}
            </button>
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium",
                g.completed && "line-through text-muted-foreground",
              )}>
                {g.title}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-muted-foreground">
                  {formatPeriodKey(g.scope, g.periodKey)}
                </span>
                {g.completed && g.completedAt && (
                  <span className="text-[11px] text-green-600 dark:text-green-500">
                    · done {formatCompletedAt(g.completedAt)}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Delete goal "${g.title}"?`)) onDelete(g.clientId);
              }}
              className="text-muted-foreground hover:text-destructive p-1.5 rounded-md transition-colors"
              aria-label="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
