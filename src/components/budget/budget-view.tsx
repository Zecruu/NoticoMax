"use client";

import { useState } from "react";
import {
  useBudget,
  type BudgetCategoryWithTotals,
  formatMonthKey,
  getCurrentMonthKey,
} from "@/hooks/use-budget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  Wallet,
  TrendingDown,
  TrendingUp,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  History,
  Crown,
  Pencil,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export function BudgetView() {
  const [viewMonthKey, setViewMonthKey] = useState<string>(getCurrentMonthKey());

  // True when the user is looking ahead — e.g. it's May and they're viewing
  // June. Used to relabel "spent" → "planned" so the screen reads as planning.
  const isFutureMonth = viewMonthKey > getCurrentMonthKey();

  const {
    isCurrentMonth,
    availableMonths,
    monthSummaries,
    allTime,
    monthlyIncome,
    setMonthlyIncome,
    categories,
    monthTransactions,
    totalBudgeted,
    totalSpent,
    unallocated,
    incomeRemaining,
    addCategory,
    deleteCategory,
    addTransaction,
    deleteTransaction,
    setCategoryLimitForMonth,
    shiftMonth,
  } = useBudget(viewMonthKey);

  const [historyOpen, setHistoryOpen] = useState(false);

  const [incomeInput, setIncomeInput] = useState(monthlyIncome ? String(monthlyIncome) : "");
  const [editingIncome, setEditingIncome] = useState(monthlyIncome === 0);

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatLimit, setNewCatLimit] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);

  const [spendingCategory, setSpendingCategory] = useState<BudgetCategoryWithTotals | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [spendNote, setSpendNote] = useState("");

  const [limitEditingCategory, setLimitEditingCategory] = useState<BudgetCategoryWithTotals | null>(null);
  const [limitInput, setLimitInput] = useState("");

  const handleSaveIncome = () => {
    const n = Number(incomeInput);
    if (Number.isNaN(n) || n < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setMonthlyIncome(n);
    setEditingIncome(false);
    toast.success("Monthly income updated");
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    const limit = Number(newCatLimit);
    if (!name || Number.isNaN(limit) || limit <= 0) {
      toast.error("Enter a name and a positive amount");
      return;
    }
    await addCategory({ name, color: newCatColor, monthlyLimit: limit });
    setNewCatName("");
    setNewCatLimit("");
    setNewCatColor(PRESET_COLORS[0]);
    setCreatingCategory(false);
    toast.success("Category added");
  };

  const openLimitEditor = (cat: BudgetCategoryWithTotals) => {
    setLimitEditingCategory(cat);
    setLimitInput(cat.hasOverride ? String(cat.effectiveLimit) : "");
  };

  const handleSaveLimit = async () => {
    if (!limitEditingCategory) return;
    const trimmed = limitInput.trim();
    if (trimmed === "") {
      await setCategoryLimitForMonth(limitEditingCategory.clientId, null);
      toast.success("Reverted to default limit");
    } else {
      const n = Number(trimmed);
      if (Number.isNaN(n) || n < 0) {
        toast.error("Enter a positive amount or leave blank to revert");
        return;
      }
      await setCategoryLimitForMonth(limitEditingCategory.clientId, n);
      toast.success(`Limit for ${formatMonthKey(viewMonthKey)}: ${formatMoney(n)}`);
    }
    setLimitEditingCategory(null);
    setLimitInput("");
  };

  const handleAddSpending = async () => {
    if (!spendingCategory) return;
    const amount = Number(spendAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    // Stamp the transaction within the viewed month. For the current month,
    // use "now" so it lands at today's date; for past months, use the 15th
    // (mid-month) so category totals attribute correctly.
    let date: string;
    if (isCurrentMonth) {
      date = new Date().toISOString();
    } else {
      const [y, m] = viewMonthKey.split("-").map(Number);
      date = new Date(y, m - 1, 15, 12, 0, 0).toISOString();
    }
    await addTransaction({
      categoryId: spendingCategory.clientId,
      amount,
      note: spendNote.trim() || undefined,
      date,
    });
    setSpendAmount("");
    setSpendNote("");
    setSpendingCategory(null);
    toast.success(`${formatMoney(amount)} logged`);
  };

  const txCategoryNameById = new Map(categories.map((c) => [c.clientId, c.name]));
  const txCategoryColorById = new Map(categories.map((c) => [c.clientId, c.color]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-6 w-6 text-primary" />
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">BudgetMaxxing</h1>
          <p className="text-sm text-muted-foreground">
            Track monthly income, set category budgets, watch them tick down as you spend.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => setHistoryOpen(true)}
        >
          <History className="h-4 w-4" />
          History
        </Button>
      </div>

      {/* Month navigator */}
      <div className="flex items-center justify-between rounded-lg border bg-card px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewMonthKey(shiftMonth(viewMonthKey, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <p className="text-sm font-medium">{formatMonthKey(viewMonthKey)}</p>
            {isFutureMonth && (
              <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider">
                Upcoming
              </span>
            )}
          </div>
          {!isCurrentMonth && (
            <button
              onClick={() => setViewMonthKey(getCurrentMonthKey())}
              className="text-xs text-primary hover:underline"
            >
              Jump to current month
            </button>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setViewMonthKey(shiftMonth(viewMonthKey, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* All-time stats */}
      {allTime.monthsTracked > 0 && (
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-2 mb-3 text-xs uppercase text-muted-foreground tracking-wider">
              <Crown className="h-3 w-3" />
              All Time
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Months tracked</p>
                <p className="text-lg font-semibold tabular-nums">{allTime.monthsTracked}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total spent</p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(allTime.totalSpent)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Avg / month</p>
                <p className="text-lg font-semibold tabular-nums">{formatMoney(allTime.avgPerMonth)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Top category</p>
                <p className="text-lg font-semibold truncate" title={allTime.topCategoryName ?? "—"}>
                  {allTime.topCategoryName ?? "—"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            Monthly Income
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editingIncome ? (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="income">Amount per month</Label>
                <Input
                  id="income"
                  type="number"
                  inputMode="decimal"
                  placeholder="3000"
                  value={incomeInput}
                  onChange={(e) => setIncomeInput(e.target.value)}
                />
              </div>
              <Button onClick={handleSaveIncome}>Save</Button>
              {monthlyIncome > 0 && (
                <Button variant="outline" onClick={() => { setIncomeInput(String(monthlyIncome)); setEditingIncome(false); }}>
                  Cancel
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-3xl font-bold tabular-nums">{formatMoney(monthlyIncome)}</div>
              <Button variant="outline" size="sm" onClick={() => setEditingIncome(true)}>
                Edit
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {monthlyIncome > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">Budgeted</p>
              <p className="text-xl font-semibold tabular-nums">{formatMoney(totalBudgeted)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">
                {isFutureMonth ? "Planned" : `Spent ${isCurrentMonth ? "this month" : "in month"}`}
              </p>
              <p className="text-xl font-semibold tabular-nums flex items-center gap-1">
                <TrendingDown className="h-4 w-4 text-destructive" />
                {formatMoney(totalSpent)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-xs uppercase text-muted-foreground tracking-wider">Income remaining</p>
              <p className={cn("text-xl font-semibold tabular-nums flex items-center gap-1", incomeRemaining < 0 && "text-destructive")}>
                <TrendingUp className={cn("h-4 w-4", incomeRemaining >= 0 ? "text-green-500" : "text-destructive")} />
                {formatMoney(incomeRemaining)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {monthlyIncome > 0 && unallocated !== 0 && (
        <p className="text-xs text-muted-foreground text-center">
          {unallocated > 0
            ? `${formatMoney(unallocated)} of your income is not yet assigned to any category.`
            : `You've budgeted ${formatMoney(-unallocated)} more than your income.`}
        </p>
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Categories</h2>
          <Button size="sm" onClick={() => setCreatingCategory(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Category
          </Button>
        </div>

        {categories.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No categories yet. Click <strong>New Category</strong> to set your first budget.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const overspent = cat.remaining < 0;
              const pct = Math.min(100, Math.max(0, cat.percent));
              return (
                <Card key={cat.clientId}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="h-3 w-3 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                        <h3 className="font-medium truncate">{cat.name}</h3>
                        {cat.hasOverride && (
                          <span className="rounded-full bg-primary/15 text-primary px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider shrink-0">
                            Custom
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setSpendingCategory(cat)}>
                          Log Spend
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => openLimitEditor(cat)}
                          title="Edit limit for this month"
                          aria-label="Edit limit for this month"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete budget category "${cat.name}"? Its transactions will also be removed.`)) {
                              deleteCategory(cat.clientId);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-baseline justify-between text-sm mb-1.5">
                      <span className="tabular-nums">
                        {formatMoney(cat.spentInMonth)} / {formatMoney(cat.effectiveLimit)}
                      </span>
                      <span className={cn("tabular-nums font-medium", overspent ? "text-destructive" : "text-muted-foreground")}>
                        {overspent ? `${formatMoney(cat.remaining)} over` : `${formatMoney(cat.remaining)} left`}
                      </span>
                    </div>

                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: overspent ? "#ef4444" : cat.color,
                        }}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent transactions for the viewed month */}
      {monthTransactions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Transactions ({monthTransactions.length})</h2>
          <Card>
            <CardContent className="p-0 divide-y">
              {monthTransactions
                .slice()
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 50)
                .map((tx) => (
                  <div key={tx.clientId} className="flex items-center gap-3 px-4 py-2.5">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: txCategoryColorById.get(tx.categoryId) ?? "#6b7280" }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">
                        {txCategoryNameById.get(tx.categoryId) ?? "(deleted category)"}
                        {tx.note && <span className="text-muted-foreground"> · {tx.note}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {new Date(tx.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">{formatMoney(tx.amount)}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remove ${formatMoney(tx.amount)} entry?`)) {
                          deleteTransaction(tx.clientId);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* New category dialog */}
      <Dialog open={creatingCategory} onOpenChange={setCreatingCategory}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Budget Category</DialogTitle>
            <DialogDescription>
              Pick a name, monthly limit, and color. Spending logged in this category will count against the limit each month.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                placeholder="Clothes, Food, Subscriptions…"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-limit">Monthly limit ($)</Label>
              <Input
                id="cat-limit"
                type="number"
                inputMode="decimal"
                placeholder="200"
                value={newCatLimit}
                onChange={(e) => setNewCatLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewCatColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-md border-2 transition-transform",
                      newCatColor === c ? "scale-110" : "border-transparent",
                    )}
                    style={{ backgroundColor: c, borderColor: newCatColor === c ? "#fff" : "transparent", boxShadow: newCatColor === c ? `0 0 0 2px ${c}` : "none" }}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreatingCategory(false)}>Cancel</Button>
            <Button onClick={handleAddCategory}>Add Category</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log spending dialog */}
      <Dialog open={!!spendingCategory} onOpenChange={(o) => !o && setSpendingCategory(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Log Spending</DialogTitle>
            <DialogDescription>
              {spendingCategory && (
                <>Add a charge to <strong>{spendingCategory.name}</strong>. {formatMoney(spendingCategory.remaining)} left this month.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="spend-amt">Amount ($)</Label>
              <Input
                id="spend-amt"
                type="number"
                inputMode="decimal"
                placeholder="25"
                value={spendAmount}
                onChange={(e) => setSpendAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spend-note">Note (optional)</Label>
              <Input
                id="spend-note"
                placeholder="What was it for?"
                value={spendNote}
                onChange={(e) => setSpendNote(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSpendingCategory(null)}>Cancel</Button>
            <Button onClick={handleAddSpending}>Log Spend</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-month limit override dialog */}
      <Dialog open={!!limitEditingCategory} onOpenChange={(o) => !o && setLimitEditingCategory(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Limit for {formatMonthKey(viewMonthKey)}</DialogTitle>
            <DialogDescription>
              {limitEditingCategory && (
                <>
                  Set a custom limit for <strong>{limitEditingCategory.name}</strong> this month only. The default ({formatMoney(limitEditingCategory.monthlyLimit)}) keeps applying to every other month. Leave blank to revert.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="limit-amt">Limit for this month ($)</Label>
              <Input
                id="limit-amt"
                type="number"
                inputMode="decimal"
                placeholder={limitEditingCategory ? String(limitEditingCategory.monthlyLimit) : ""}
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground">Default: {limitEditingCategory ? formatMoney(limitEditingCategory.monthlyLimit) : ""}</p>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            {limitEditingCategory?.hasOverride ? (
              <Button
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                onClick={async () => {
                  if (!limitEditingCategory) return;
                  await setCategoryLimitForMonth(limitEditingCategory.clientId, null);
                  toast.success("Reverted to default limit");
                  setLimitEditingCategory(null);
                  setLimitInput("");
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Revert
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLimitEditingCategory(null)}>Cancel</Button>
              <Button onClick={handleSaveLimit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Monthly history dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Spending History</DialogTitle>
            <DialogDescription>
              Tap a month to view it in detail.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            {availableMonths.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No months tracked yet.</p>
            ) : (
              <div className="divide-y">
                {monthSummaries.map((m) => (
                  <button
                    key={m.monthKey}
                    onClick={() => { setViewMonthKey(m.monthKey); setHistoryOpen(false); }}
                    className="flex w-full items-center justify-between py-3 text-left hover:bg-muted/50 -mx-2 px-2 rounded"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{formatMonthKey(m.monthKey)}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.topCategoryName
                          ? <>Top: {m.topCategoryName} · {formatMoney(m.topCategorySpent)}</>
                          : "No spending"}
                      </p>
                    </div>
                    <span className="tabular-nums font-medium">{formatMoney(m.totalSpent)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
