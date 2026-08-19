"use client";

import { useMemo, useState } from "react";
import {
  useBudget,
  type BudgetCategoryWithTotals,
  formatMonthKey,
  getCurrentMonthKey,
} from "@/hooks/use-budget";
import { useBills } from "@/hooks/use-bills";
import type { LocalBill } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  DollarSign,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  Settings2,
  Target,
  Trash2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
];

const MOBILE_DIALOG_CLASS = "top-[calc(var(--visual-viewport-height,100vh)/2)] max-h-[calc(var(--visual-viewport-height,100vh)-2rem)] overflow-y-auto sm:max-w-md";

function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function dateForMonth(monthKey: string, isCurrentMonth: boolean): string {
  if (isCurrentMonth) return new Date().toISOString();
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 15, 12, 0, 0).toISOString();
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function BudgetView() {
  const [viewMonthKey, setViewMonthKey] = useState(getCurrentMonthKey());
  const {
    isCurrentMonth,
    availableMonths,
    monthSummaries,
    monthlyIncome,
    setMonthlyIncome,
    monthlyBudgetGoal,
    setMonthlyBudgetGoal,
    budgetRemaining,
    categories,
    monthTransactions,
    totalSpent,
    addCategory,
    deleteCategory,
    addTransaction,
    deleteTransaction,
    setCategoryLimitForMonth,
    shiftMonth,
  } = useBudget(viewMonthKey);

  const { unpaidBills, paidBills, addBill, removeBill, markPaid, unmarkPaid } = useBills();

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("goal");
  const [goalInput, setGoalInput] = useState("");
  const [incomeInput, setIncomeInput] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [billsOpen, setBillsOpen] = useState(false);
  const [showPaidBills, setShowPaidBills] = useState(false);

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatLimit, setNewCatLimit] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);
  const [limitEditingCategory, setLimitEditingCategory] = useState<BudgetCategoryWithTotals | null>(null);
  const [limitInput, setLimitInput] = useState("");
  const [spendInputs, setSpendInputs] = useState<Record<string, string>>({});

  const [creatingBill, setCreatingBill] = useState(false);
  const [newBillName, setNewBillName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillDue, setNewBillDue] = useState("");
  const [newBillCategoryId, setNewBillCategoryId] = useState("");

  const transactionsByCategory = useMemo(() => {
    const result = new Map<string, typeof monthTransactions>();
    for (const transaction of [...monthTransactions].sort((a, b) => b.date.localeCompare(a.date))) {
      const list = result.get(transaction.categoryId) ?? [];
      list.push(transaction);
      result.set(transaction.categoryId, list);
    }
    return result;
  }, [monthTransactions]);

  const categoryNameById = useMemo(
    () => new Map(categories.map((category) => [category.clientId, category.name])),
    [categories],
  );

  const openSettings = (tab: "goal" | "income") => {
    setSettingsTab(tab);
    setGoalInput(monthlyBudgetGoal > 0 ? String(monthlyBudgetGoal) : "");
    setIncomeInput(monthlyIncome > 0 ? String(monthlyIncome) : "");
    setSettingsOpen(true);
  };

  const saveGoal = () => {
    const amount = Number(goalInput);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid budget goal");
      return;
    }
    setMonthlyBudgetGoal(amount);
    setSettingsOpen(false);
    toast.success(`Budget goal saved for ${formatMonthKey(viewMonthKey)}`);
  };

  const saveIncome = () => {
    const amount = Number(incomeInput);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid monthly income");
      return;
    }
    setMonthlyIncome(amount);
    setSettingsOpen(false);
    toast.success("Monthly income updated");
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    const target = newCatLimit.trim() === "" ? 0 : Number(newCatLimit);
    if (!name) {
      toast.error("Enter a category name");
      return;
    }
    if (!Number.isFinite(target) || target < 0) {
      toast.error("Enter a valid category target");
      return;
    }
    const categoryId = await addCategory({ name, color: newCatColor, monthlyLimit: 0 });
    if (target > 0) await setCategoryLimitForMonth(categoryId, target);
    setNewCatName("");
    setNewCatLimit("");
    setNewCatColor(PRESET_COLORS[0]);
    setCreatingCategory(false);
    toast.success(`${name} added`);
  };

  const logCategorySpend = async (category: BudgetCategoryWithTotals) => {
    const amount = Number(spendInputs[category.clientId]);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a positive amount");
      return;
    }
    await addTransaction({
      categoryId: category.clientId,
      amount,
      date: dateForMonth(viewMonthKey, isCurrentMonth),
    });
    setSpendInputs((current) => ({ ...current, [category.clientId]: "" }));
    toast.success(`${formatMoney(amount)} added to ${category.name}`);
  };

  const openLimitEditor = (category: BudgetCategoryWithTotals) => {
    setLimitEditingCategory(category);
    setLimitInput(category.effectiveLimit > 0 ? String(category.effectiveLimit) : "");
  };

  const saveCategoryTarget = async () => {
    if (!limitEditingCategory) return;
    const target = limitInput.trim() === "" ? 0 : Number(limitInput);
    if (!Number.isFinite(target) || target < 0) {
      toast.error("Enter a valid category target");
      return;
    }
    await setCategoryLimitForMonth(limitEditingCategory.clientId, target);
    setLimitEditingCategory(null);
    setLimitInput("");
    toast.success("Category target updated");
  };

  const startAddingBill = () => {
    if (categories.length === 0) {
      toast.error("Create a category first");
      return;
    }
    setNewBillCategoryId(categories[0].clientId);
    setCreatingBill(true);
  };

  const handleAddBill = async () => {
    const name = newBillName.trim();
    const amount = Number(newBillAmount);
    if (!name || !Number.isFinite(amount) || amount <= 0 || !newBillCategoryId) {
      toast.error("Add a category, name, and positive amount");
      return;
    }
    await addBill({
      name,
      amount,
      dueDate: newBillDue || undefined,
      categoryId: newBillCategoryId,
    });
    setNewBillName("");
    setNewBillAmount("");
    setNewBillDue("");
    setNewBillCategoryId("");
    setCreatingBill(false);
    toast.success(`${name} added`);
  };

  const handleMarkPaid = async (bill: LocalBill) => {
    await markPaid(bill.clientId, { categoryId: bill.categoryId });
    toast.success(`${bill.name} paid and logged`);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-5 pb-8 md:px-6 md:py-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold md:text-2xl">Budget</h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => setHistoryOpen(true)}
            aria-label="Spending history"
            title="Spending history"
          >
            <History className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            onClick={() => openSettings("goal")}
            aria-label="Budget settings"
            title="Budget settings"
          >
            <Settings2 className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <div className="mb-3 flex min-h-12 items-center justify-between rounded-md border bg-card px-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={() => setViewMonthKey(shiftMonth(viewMonthKey, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <button className="min-h-11 px-3 text-sm font-semibold" onClick={() => setViewMonthKey(getCurrentMonthKey())}>
          {formatMonthKey(viewMonthKey)}
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11"
          onClick={() => setViewMonthKey(shiftMonth(viewMonthKey, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-2">
        <button
          className="min-h-16 rounded-md border bg-card px-3 py-2 text-left"
          onClick={() => openSettings("goal")}
        >
          <span className="block text-[11px] font-medium text-muted-foreground">Budget left</span>
          <span className={cn("block truncate text-lg font-semibold tabular-nums", budgetRemaining < 0 && "text-destructive")}>
            {formatMoney(budgetRemaining)}
          </span>
        </button>
        <div className="min-h-16 rounded-md border bg-card px-3 py-2">
          <span className="block text-[11px] font-medium text-muted-foreground">Total spent</span>
          <span className="block truncate text-lg font-semibold tabular-nums">{formatMoney(totalSpent)}</span>
        </div>
      </div>

      <section aria-labelledby="budget-categories-title">
        <div className="mb-2 flex min-h-11 items-center justify-between gap-3">
          <div>
            <h2 id="budget-categories-title" className="text-base font-semibold">Categories</h2>
            <p className="text-xs text-muted-foreground">{categories.length} {categories.length === 1 ? "category" : "categories"}</p>
          </div>
          <Button size="sm" className="h-11 gap-1.5" onClick={() => setCreatingCategory(true)}>
            <Plus className="h-4 w-4" />
            Category
          </Button>
        </div>

        {categories.length === 0 ? (
          <button
            className="flex min-h-28 w-full items-center justify-center rounded-md border border-dashed px-4 text-sm text-muted-foreground"
            onClick={() => setCreatingCategory(true)}
          >
            Create your first spending category
          </button>
        ) : (
          <div className="divide-y border-y md:overflow-hidden md:rounded-md md:border">
            {categories.map((category) => {
              const transactions = transactionsByCategory.get(category.clientId) ?? [];
              const latestTransactions = transactions.slice(0, 3);
              const overTarget = category.effectiveLimit > 0 && category.remaining < 0;
              const progress = category.effectiveLimit > 0
                ? Math.min(100, Math.max(0, category.percent))
                : 0;

              return (
                <article key={category.clientId} className="py-4 md:px-5">
                  <div className="mb-3 flex items-start gap-3">
                    <span className="mt-1.5 h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: category.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="truncate font-medium">{category.name}</h3>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(category.spentInMonth)}</span>
                      </div>
                      {category.effectiveLimit > 0 && (
                        <>
                          <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                            <span>{formatMoney(category.effectiveLimit)} target</span>
                            <span className={cn(overTarget && "text-destructive")}>
                              {overTarget ? `${formatMoney(-category.remaining)} over` : `${formatMoney(category.remaining)} left`}
                            </span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full transition-[width]"
                              style={{
                                width: `${progress}%`,
                                backgroundColor: overTarget ? "#ef4444" : category.color,
                              }}
                            />
                          </div>
                        </>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="-mr-2 h-11 w-11 shrink-0" aria-label={`Manage ${category.name}`}>
                          <MoreHorizontal className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openLimitEditor(category)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Monthly target
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => {
                            if (confirm(`Delete "${category.name}" and its spending history?`)) {
                              void deleteCategory(category.clientId);
                            }
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete category
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="flex gap-2 pl-6">
                    <div className="relative min-w-0 flex-1">
                      <DollarSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        aria-label={`Amount spent on ${category.name}`}
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="0.01"
                        placeholder="Amount spent"
                        className="h-11 pl-9"
                        value={spendInputs[category.clientId] ?? ""}
                        onChange={(event) => setSpendInputs((current) => ({
                          ...current,
                          [category.clientId]: event.target.value,
                        }))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void logCategorySpend(category);
                          }
                        }}
                      />
                    </div>
                    <Button
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      onClick={() => void logCategorySpend(category)}
                      aria-label={`Add spending to ${category.name}`}
                    >
                      <Plus className="h-5 w-5" />
                    </Button>
                  </div>

                  {latestTransactions.length > 0 && (
                    <div className="mt-3 divide-y pl-6">
                      {latestTransactions.map((transaction) => (
                        <div key={transaction.clientId} className="flex min-h-11 items-center gap-3 py-1.5 text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-muted-foreground">{transaction.note || "Expense"}</p>
                            <p className="text-[11px] text-muted-foreground">{shortDate(transaction.date)}</p>
                          </div>
                          <span className="shrink-0 font-medium tabular-nums">{formatMoney(transaction.amount)}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Remove ${formatMoney(transaction.amount)} entry?`)) {
                                void deleteTransaction(transaction.clientId);
                              }
                            }}
                            aria-label="Delete spending entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      {transactions.length > latestTransactions.length && (
                        <p className="py-2 text-xs text-muted-foreground">
                          +{transactions.length - latestTransactions.length} earlier {transactions.length - latestTransactions.length === 1 ? "entry" : "entries"}
                        </p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <button
        className="mt-5 flex min-h-12 w-full items-center gap-3 rounded-md border px-3 text-left text-sm hover:bg-muted/50"
        onClick={() => setBillsOpen(true)}
      >
        <ReceiptText className="h-5 w-5 text-muted-foreground" />
        <span className="flex-1 font-medium">Scheduled bills</span>
        <span className="text-muted-foreground">{unpaidBills.length}</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className={MOBILE_DIALOG_CLASS}>
          <DialogHeader>
            <DialogTitle>Monthly budget</DialogTitle>
            <DialogDescription>{formatMonthKey(viewMonthKey)}</DialogDescription>
          </DialogHeader>
          <Tabs value={settingsTab} onValueChange={setSettingsTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="goal"><Target className="h-4 w-4" />Goal</TabsTrigger>
              <TabsTrigger value="income"><DollarSign className="h-4 w-4" />Income</TabsTrigger>
            </TabsList>
            <TabsContent value="goal" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="budget-goal">Amount to budget this month</Label>
                <Input
                  id="budget-goal"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="1500"
                  value={goalInput}
                  onChange={(event) => setGoalInput(event.target.value)}
                  autoFocus={settingsTab === "goal"}
                />
              </div>
              <Button className="h-11 w-full" onClick={saveGoal}>Save budget goal</Button>
            </TabsContent>
            <TabsContent value="income" className="space-y-4 pt-2">
              <div className="space-y-1.5">
                <Label htmlFor="monthly-income">Monthly income</Label>
                <Input
                  id="monthly-income"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  placeholder="3000"
                  value={incomeInput}
                  onChange={(event) => setIncomeInput(event.target.value)}
                />
              </div>
              <Button className="h-11 w-full" onClick={saveIncome}>Save income</Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <Dialog open={creatingCategory} onOpenChange={setCreatingCategory}>
        <DialogContent className={MOBILE_DIALOG_CLASS}>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
            <DialogDescription>Group related spending together.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                placeholder="Gas, Groceries, Rent"
                value={newCatName}
                onChange={(event) => setNewCatName(event.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="category-target">Monthly target (optional)</Label>
              <Input
                id="category-target"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="200"
                value={newCatLimit}
                onChange={(event) => setNewCatLimit(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    className={cn(
                      "h-11 w-11 rounded-md border-2",
                      newCatColor === color ? "border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewCatColor(color)}
                    aria-label={`Use ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <Button className="h-11 w-full" onClick={() => void handleAddCategory()}>Add category</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!limitEditingCategory} onOpenChange={(open) => !open && setLimitEditingCategory(null)}>
        <DialogContent className={MOBILE_DIALOG_CLASS}>
          <DialogHeader>
            <DialogTitle>{limitEditingCategory?.name} target</DialogTitle>
            <DialogDescription>{formatMonthKey(viewMonthKey)}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="category-monthly-target">Monthly target</Label>
            <Input
              id="category-monthly-target"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="No target"
              value={limitInput}
              onChange={(event) => setLimitInput(event.target.value)}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            {limitEditingCategory?.hasOverride && (
              <Button
                variant="outline"
                className="h-11 gap-1.5"
                onClick={async () => {
                  await setCategoryLimitForMonth(limitEditingCategory.clientId, null);
                  setLimitEditingCategory(null);
                  setLimitInput("");
                  toast.success("Category target reset");
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            )}
            <Button className="h-11 flex-1" onClick={() => void saveCategoryTarget()}>Save target</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={billsOpen} onOpenChange={setBillsOpen}>
        <DialogContent className={cn(MOBILE_DIALOG_CLASS, "sm:max-w-lg")}>
          <DialogHeader>
            <DialogTitle>Scheduled bills</DialogTitle>
            <DialogDescription>Assign each bill to the category it belongs to.</DialogDescription>
          </DialogHeader>

          {creatingBill ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bill-category">Category</Label>
                <Select value={newBillCategoryId} onValueChange={setNewBillCategoryId}>
                  <SelectTrigger id="bill-category" className="h-11 w-full">
                    <SelectValue placeholder="Choose category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category.clientId} value={category.clientId}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bill-name">Bill name</Label>
                <Input id="bill-name" value={newBillName} onChange={(event) => setNewBillName(event.target.value)} placeholder="Gas bill" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="bill-amount">Amount</Label>
                  <Input id="bill-amount" type="number" inputMode="decimal" value={newBillAmount} onChange={(event) => setNewBillAmount(event.target.value)} placeholder="80" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="bill-date">Due date</Label>
                  <Input id="bill-date" type="date" value={newBillDue} onChange={(event) => setNewBillDue(event.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="h-11" onClick={() => setCreatingBill(false)}>Cancel</Button>
                <Button className="h-11 flex-1" onClick={() => void handleAddBill()}>Add bill</Button>
              </div>
            </div>
          ) : (
            <>
              <Button variant="outline" className="h-11 w-full gap-1.5" onClick={startAddingBill}>
                <Plus className="h-4 w-4" />
                Add scheduled bill
              </Button>
              {unpaidBills.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No scheduled bills.</p>
              ) : (
                <div className="max-h-[40vh] divide-y overflow-y-auto">
                  {unpaidBills.map((bill) => (
                    <div key={bill.clientId} className="flex min-h-14 items-center gap-3 py-2">
                      <button className="flex h-11 w-11 shrink-0 items-center justify-center" onClick={() => void handleMarkPaid(bill)} aria-label={`Mark ${bill.name} paid`}>
                        <Circle className="h-5 w-5 text-muted-foreground" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{bill.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {categoryNameById.get(bill.categoryId ?? "") ?? "Uncategorized"}
                          {bill.dueDate ? ` · ${shortDate(bill.dueDate)}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(bill.amount)}</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => void removeBill(bill.clientId)}
                        aria-label={`Delete ${bill.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {paidBills.length > 0 && (
                <div className="border-t pt-2">
                  <button className="flex min-h-11 w-full items-center justify-between text-sm text-muted-foreground" onClick={() => setShowPaidBills((current) => !current)}>
                    <span>Paid bills ({paidBills.length})</span>
                    <ChevronRight className={cn("h-4 w-4 transition-transform", showPaidBills && "rotate-90")} />
                  </button>
                  {showPaidBills && paidBills.slice(0, 20).map((bill) => (
                    <div key={bill.clientId} className="flex min-h-12 items-center gap-3 py-1.5 opacity-70">
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
                      <span className="min-w-0 flex-1 truncate text-sm line-through">{bill.name}</span>
                      <span className="shrink-0 text-sm tabular-nums line-through">{formatMoney(bill.amount)}</span>
                      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => void unmarkPaid(bill.clientId)} aria-label={`Mark ${bill.name} unpaid`}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className={cn(MOBILE_DIALOG_CLASS, "sm:max-w-lg")}>
          <DialogHeader>
            <DialogTitle>Spending history</DialogTitle>
            <DialogDescription>Choose a month to review its categories.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] divide-y overflow-y-auto">
            {availableMonths.map((summaryMonth) => {
              const summary = monthSummaries.find((item) => item.monthKey === summaryMonth);
              return (
                <button
                  key={summaryMonth}
                  className="flex min-h-14 w-full items-center gap-3 py-2 text-left"
                  onClick={() => {
                    setViewMonthKey(summaryMonth);
                    setHistoryOpen(false);
                  }}
                >
                  <CalendarDays className="h-5 w-5 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{formatMonthKey(summaryMonth)}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {summary?.topCategoryName ? `Top: ${summary.topCategoryName}` : "No spending"}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(summary?.totalSpent ?? 0)}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
