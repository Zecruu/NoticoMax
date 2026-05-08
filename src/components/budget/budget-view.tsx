"use client";

import { useState } from "react";
import { useBudget, type BudgetCategoryWithTotals } from "@/hooks/use-budget";
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
import { Plus, Trash2, Wallet, TrendingDown, TrendingUp, DollarSign } from "lucide-react";
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
  const {
    monthlyIncome,
    setMonthlyIncome,
    categories,
    totalBudgeted,
    totalSpent,
    unallocated,
    incomeRemaining,
    addCategory,
    deleteCategory,
    addTransaction,
  } = useBudget();

  const [incomeInput, setIncomeInput] = useState(monthlyIncome ? String(monthlyIncome) : "");
  const [editingIncome, setEditingIncome] = useState(monthlyIncome === 0);

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatLimit, setNewCatLimit] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);

  const [spendingCategory, setSpendingCategory] = useState<BudgetCategoryWithTotals | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [spendNote, setSpendNote] = useState("");

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

  const handleAddSpending = async () => {
    if (!spendingCategory) return;
    const amount = Number(spendAmount);
    if (Number.isNaN(amount) || amount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    await addTransaction({
      categoryId: spendingCategory.clientId,
      amount,
      note: spendNote.trim() || undefined,
    });
    setSpendAmount("");
    setSpendNote("");
    setSpendingCategory(null);
    toast.success(`${formatMoney(amount)} logged`);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">BudgetMaxxing</h1>
          <p className="text-sm text-muted-foreground">
            Track monthly income, set category budgets, watch them tick down as you spend.
          </p>
        </div>
      </div>

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
              <p className="text-xs uppercase text-muted-foreground tracking-wider">Spent this month</p>
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
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="h-7" onClick={() => setSpendingCategory(cat)}>
                          Log Spend
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
                        {formatMoney(cat.spentThisMonth)} / {formatMoney(cat.monthlyLimit)}
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
    </div>
  );
}
