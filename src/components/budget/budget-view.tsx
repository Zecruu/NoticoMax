"use client";

import { useMemo, useRef, useState } from "react";
import {
  useBudget,
  type BudgetCategoryWithTotals,
  formatMonthKey,
  getCurrentMonthKey,
} from "@/hooks/use-budget";
import { useBills } from "@/hooks/use-bills";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  billDueDate,
  defaultExpenseDate,
  expenseDateToIso,
  parseBudgetAmount,
} from "@/lib/budget/input";
import { Label } from "@/components/ui/label";
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
  ChevronLeft,
  ChevronRight,
  History,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Receipt,
  ArrowDownToLine,
  Circle,
  CheckCircle2,
  Calendar as CalendarIcon,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";
import type { LocalBudgetTransaction } from "@/lib/db/indexed-db";

const PRESET_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function formatMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function expenseName(tx: LocalBudgetTransaction): string {
  return tx.note?.trim() || "Expense";
}

function normalizeExpenseName(value: string): string | undefined {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed || undefined;
}

function formatTransactionDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function BudgetView() {
  const [viewMonthKey, setViewMonthKey] = useState<string>(
    getCurrentMonthKey()
  );

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

  const [incomeInput, setIncomeInput] = useState(
    monthlyIncome ? String(monthlyIncome) : ""
  );
  const [editingIncome, setEditingIncome] = useState(false);
  const [section, setSection] = useState("categories");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [activityLimit, setActivityLimit] = useState(50);
  const [spendDate, setSpendDate] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);

  const runMutation = async (action: () => Promise<void>) => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      await action();
    } catch {
      toast.error(
        "Couldn't save this change. Check your entries and try again."
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const openExpense = (category?: BudgetCategoryWithTotals) => {
    setSpendingCategory(category ?? categories[0] ?? null);
    setSpendDate(defaultExpenseDate(viewMonthKey));
    setExpenseOpen(true);
  };

  const [creatingCategory, setCreatingCategory] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatLimit, setNewCatLimit] = useState("");
  const [newCatColor, setNewCatColor] = useState(PRESET_COLORS[0]);

  const [spendingCategory, setSpendingCategory] =
    useState<BudgetCategoryWithTotals | null>(null);
  const [spendAmount, setSpendAmount] = useState("");
  const [spendNote, setSpendNote] = useState("");
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    () => new Set()
  );

  const [limitEditingCategory, setLimitEditingCategory] =
    useState<BudgetCategoryWithTotals | null>(null);
  const [limitInput, setLimitInput] = useState("");

  // Upcoming bills: user explicitly creates a bill they need to pay; Mark
  // Paid converts it into a budget transaction in the Bills category.
  const { unpaidBills, paidBills, addBill, removeBill, markPaid, unmarkPaid } =
    useBills();
  const [creatingBill, setCreatingBill] = useState(false);
  const [newBillName, setNewBillName] = useState("");
  const [newBillAmount, setNewBillAmount] = useState("");
  const [newBillDue, setNewBillDue] = useState("");
  const [showPaidBills, setShowPaidBills] = useState(false);

  const handleAddBill = async () => {
    const name = newBillName.trim();
    const amount = parseBudgetAmount(newBillAmount);
    if (!name || amount === null || amount <= 0) {
      toast.error("Add a name and a positive amount");
      return;
    }
    await addBill({
      name,
      amount,
      dueDate: newBillDue || undefined,
    });
    setNewBillName("");
    setNewBillAmount("");
    setNewBillDue("");
    setCreatingBill(false);
    toast.success(`${name} added`);
  };

  const handleMarkPaid = async (
    clientId: string,
    name: string,
    amount: number
  ) => {
    await markPaid(clientId);
    toast.success(`${name} marked paid · ${formatMoney(amount)} logged`);
  };

  const handleUnmarkPaid = async (clientId: string, name: string) => {
    await unmarkPaid(clientId);
    toast.success(`${name} reverted to unpaid`);
  };

  const handleSaveIncome = () => {
    const n = parseBudgetAmount(incomeInput);
    if (n === null || n < 0) {
      toast.error("Enter an amount with at most two decimal places");
      return;
    }
    setMonthlyIncome(n);
    setEditingIncome(false);
    toast.success("Monthly income updated");
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    const limit = parseBudgetAmount(newCatLimit);
    if (!name || limit === null || limit <= 0) {
      toast.error("Enter a name and a positive amount");
      return;
    }
    // Per-month budgets: the category itself has monthlyLimit=0 (no forever
    // default). The amount the user typed is stamped as an override for the
    // viewed month only. Future months start at $0 until the user sets them
    // (or taps "Carry over from last month").
    const newClientId = await addCategory({
      name,
      color: newCatColor,
      monthlyLimit: 0,
    });
    await setCategoryLimitForMonth(newClientId, limit);
    setNewCatName("");
    setNewCatLimit("");
    setNewCatColor(PRESET_COLORS[0]);
    setCreatingCategory(false);
    toast.success(`${name} budgeted for ${formatMonthKey(viewMonthKey)}`);
  };

  // Copy this-month limits from the immediately prior month. Looks at the
  // PREVIOUS month's effective limit per category — only fills categories
  // that don't yet have an override in the current viewed month.
  const handleCarryFromLastMonth = async () => {
    const prevMonthKey = shiftMonth(viewMonthKey, -1);
    const prevOverrides = await import("@/lib/db/indexed-db").then(
      async ({ default: db }) => {
        const all = await db.budgetCategoryOverrides.toArray();
        const map = new Map<string, number>();
        for (const o of all) {
          if (o.deleted || o.monthKey !== prevMonthKey) continue;
          map.set(o.categoryId, o.monthlyLimit);
        }
        return map;
      }
    );
    let count = 0;
    for (const cat of categories) {
      if (cat.hasOverride) continue;
      const prevLimit = prevOverrides.get(cat.clientId) ?? cat.monthlyLimit;
      if (prevLimit > 0) {
        await setCategoryLimitForMonth(cat.clientId, prevLimit);
        count++;
      }
    }
    if (count > 0)
      toast.success(
        `Carried ${count} budget${count > 1 ? "s" : ""} from ${formatMonthKey(
          prevMonthKey
        )}`
      );
    else toast.info("Nothing to carry from last month");
  };

  const openLimitEditor = (cat: BudgetCategoryWithTotals) => {
    setLimitEditingCategory(cat);
    setLimitInput(cat.hasOverride ? String(cat.effectiveLimit) : "");
  };

  const handleSaveLimit = async () => {
    if (!limitEditingCategory) return;
    const trimmed = limitInput.trim();
    if (trimmed === "" || parseBudgetAmount(trimmed) === 0) {
      await setCategoryLimitForMonth(limitEditingCategory.clientId, null);
      toast.success("Reverted to default limit");
    } else {
      const n = parseBudgetAmount(trimmed);
      if (n === null || n < 0) {
        toast.error(
          "Enter an amount with at most two decimals, or leave blank to revert"
        );
        return;
      }
      await setCategoryLimitForMonth(limitEditingCategory.clientId, n);
      toast.success(
        `Limit for ${formatMonthKey(viewMonthKey)}: ${formatMoney(n)}`
      );
    }
    setLimitEditingCategory(null);
    setLimitInput("");
  };

  const handleAddSpending = async () => {
    if (!spendingCategory) return;
    const amount = parseBudgetAmount(spendAmount);
    const date = expenseDateToIso(spendDate, viewMonthKey);
    if (amount === null || amount <= 0) {
      toast.error("Enter a positive amount with at most two decimal places");
      return;
    }
    if (!date) {
      toast.error("Choose a valid date in the month you are viewing");
      return;
    }
    const note = normalizeExpenseName(spendNote);
    await addTransaction({
      categoryId: spendingCategory.clientId,
      amount,
      note,
      date,
    });
    setSpendAmount("");
    setSpendNote("");
    setSpendingCategory(null);
    setExpenseOpen(false);
    toast.success(`${note ?? "Expense"} · ${formatMoney(amount)} logged`);
  };

  const sortedMonthTransactions = useMemo(
    () =>
      monthTransactions.slice().sort((a, b) => b.date.localeCompare(a.date)),
    [monthTransactions]
  );
  const transactionsByCategoryId = useMemo(() => {
    const map = new Map<string, LocalBudgetTransaction[]>();
    for (const tx of sortedMonthTransactions) {
      const txs = map.get(tx.categoryId) ?? [];
      txs.push(tx);
      map.set(tx.categoryId, txs);
    }
    return map;
  }, [sortedMonthTransactions]);
  const txCategoryNameById = new Map(
    categories.map((c) => [c.clientId, c.name])
  );
  const txCategoryColorById = new Map(
    categories.map((c) => [c.clientId, c.color])
  );

  const toggleCategoryEntries = (categoryId: string) => {
    setExpandedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const closeSpendingDialog = () => {
    if (saving.current) return;
    setExpenseOpen(false);
    setSpendingCategory(null);
    setSpendAmount("");
    setSpendNote("");
  };

  const handleDeleteTransaction = (tx: LocalBudgetTransaction) => {
    const name = expenseName(tx);
    if (confirm(`Remove "${name}" (${formatMoney(tx.amount)}) entry?`)) {
      void runMutation(() => deleteTransaction(tx.clientId));
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-6 md:px-6 md:py-8">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Budget Maxxing
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A clearer picture of your money, month by month.
          </p>
        </div>
        <Button
          className="min-h-11 shrink-0 gap-2"
          onClick={() =>
            categories.length ? openExpense() : setCreatingCategory(true)
          }
        >
          <Plus className="size-4" />
          {categories.length ? "Add expense" : "Get started"}
        </Button>
      </header>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button
            variant="ghost"
            className="size-11 shrink-0"
            disabled={busy}
            onClick={() => {
              setViewMonthKey(shiftMonth(viewMonthKey, -1));
              setActivityLimit(50);
            }}
            aria-label="Previous month"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <h2 className="text-center font-semibold">
            {formatMonthKey(viewMonthKey)}
          </h2>
          <Button
            variant="ghost"
            className="size-11 shrink-0"
            disabled={busy}
            onClick={() => {
              setViewMonthKey(shiftMonth(viewMonthKey, 1));
              setActivityLimit(50);
            }}
            aria-label="Next month"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <Button
          variant="ghost"
          className="min-h-11 shrink-0 gap-2"
          onClick={() => setHistoryOpen(true)}
          aria-label="Spending history"
        >
          <History className="size-4" />
          <span className="hidden sm:inline">History</span>
        </Button>
      </div>
      {!isCurrentMonth && (
        <Button
          variant="link"
          className="min-h-11 p-0"
          onClick={() => setViewMonthKey(getCurrentMonthKey())}
        >
          Back to this month
        </Button>
      )}
      <section
        aria-label="Monthly overview"
        className="rounded-xl bg-muted/40 p-4 sm:p-5"
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
          <div>
            <dt className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground">
              Monthly income
              <Button
                variant="ghost"
                className="size-11"
                aria-label="Edit monthly income"
                onClick={() => {
                  setIncomeInput(monthlyIncome ? String(monthlyIncome) : "");
                  setEditingIncome(true);
                }}
              >
                <Pencil className="size-3.5" />
              </Button>
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {formatMoney(monthlyIncome)}
            </dd>
          </div>
          <div>
            <dt className="flex min-h-11 items-center text-sm text-muted-foreground">
              {isFutureMonth ? "Planned expenses" : "Spent"}
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {formatMoney(totalSpent)}
            </dd>
          </div>
          <div className="col-span-2 border-t pt-3 sm:col-span-1 sm:border-t-0 sm:pt-0">
            <dt className="flex min-h-11 items-center text-sm text-muted-foreground">
              {incomeRemaining < 0 ? "Over income" : "Income remaining"}
            </dt>
            <dd
              className={cn(
                "text-xl font-semibold tabular-nums",
                incomeRemaining < 0 && "text-destructive"
              )}
            >
              {formatMoney(Math.abs(incomeRemaining))}
            </dd>
          </div>
        </dl>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {monthlyIncome === 0
            ? "Set your monthly income to see what remains after expenses."
            : `${formatMoney(totalBudgeted)} assigned to categories. ${
                unallocated >= 0
                  ? `${formatMoney(unallocated)} still unassigned.`
                  : `${formatMoney(
                      -unallocated
                    )} more budgeted than your income.`
              }`}
        </p>
      </section>
      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="mb-6 grid w-full grid-cols-3 group-data-[orientation=horizontal]/tabs:h-12">
          <TabsTrigger className="min-h-11" value="categories">
            Categories
          </TabsTrigger>
          <TabsTrigger className="min-h-11" value="activity">
            Activity
          </TabsTrigger>
          <TabsTrigger className="min-h-11" value="bills">
            Bills{unpaidBills.length > 0 ? ` (${unpaidBills.length})` : ""}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="categories">
          {" "}
          <div>
            <div className="flex flex-wrap items-center justify-between mb-3 gap-2">
              <h2 className="text-lg font-semibold">Categories</h2>
              <div className="flex items-center gap-1.5">
                {categories.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11 gap-1.5"
                    disabled={busy}
                    onClick={() => void runMutation(handleCarryFromLastMonth)}
                    title={`Use last month's limits in ${formatMonthKey(
                      viewMonthKey
                    )}`}
                  >
                    <ArrowDownToLine className="h-3.5 w-3.5" />
                    Use last month
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCreatingCategory(true)}
                  className="min-h-11 gap-1.5"
                >
                  <Plus className="h-4 w-4" />
                  Add category
                </Button>
              </div>
            </div>

            {categories.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No categories yet. Choose <strong>Add category</strong> to set
                your first budget.
              </div>
            ) : (
              <div className="divide-y">
                {categories.map((cat) => {
                  const overspent = cat.remaining < 0;
                  const pct = Math.min(100, Math.max(0, cat.percent));
                  const categoryTransactions =
                    transactionsByCategoryId.get(cat.clientId) ?? [];
                  const isExpanded = expandedCategoryIds.has(cat.clientId);
                  const visibleTransactions = categoryTransactions;
                  return (
                    <section key={cat.clientId} className="py-5 first:pt-1">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className="h-3 w-3 rounded-sm shrink-0"
                            style={{ backgroundColor: cat.color }}
                          />
                          <h3 className="font-medium truncate">{cat.name}</h3>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            className="min-h-11 gap-1.5"
                            onClick={() => openExpense(cat)}
                            aria-label={`Add expense to ${cat.name}`}
                          >
                            <Plus className="size-4" />
                            <span className="hidden sm:inline">Expense</span>
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                className="size-11"
                                aria-label={`Options for ${cat.name}`}
                              >
                                <MoreHorizontal className="size-5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="min-h-11"
                                onSelect={() => openLimitEditor(cat)}
                              >
                                Edit this month&apos;s limit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="min-h-11 text-destructive"
                                disabled={busy}
                                onSelect={() => {
                                  if (
                                    confirm(
                                      `Delete budget category "${cat.name}"? Its transactions will also be removed.`
                                    )
                                  )
                                    void runMutation(() =>
                                      deleteCategory(cat.clientId)
                                    );
                                }}
                              >
                                Delete category
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>

                      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                        <span className="tabular-nums">
                          {formatMoney(cat.spentInMonth)} spent of{" "}
                          {formatMoney(cat.effectiveLimit)}
                        </span>
                        <span
                          className={cn(
                            "tabular-nums font-medium",
                            overspent
                              ? "text-destructive"
                              : "text-muted-foreground"
                          )}
                        >
                          {overspent
                            ? `${formatMoney(-cat.remaining)} over`
                            : `${formatMoney(cat.remaining)} left`}
                        </span>
                      </div>

                      <div
                        role="progressbar"
                        aria-label={`${cat.name} budget used`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={pct}
                        aria-valuetext={`${formatMoney(
                          cat.spentInMonth
                        )} spent of ${formatMoney(cat.effectiveLimit)}`}
                        className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                      >
                        <div
                          className="h-full transition-[width] duration-200 motion-reduce:transition-none"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: overspent ? "#ef4444" : cat.color,
                          }}
                        />
                      </div>

                      {categoryTransactions.length > 0 && (
                        <Button
                          variant="ghost"
                          className="mt-2 min-h-11 gap-2 px-0 text-sm text-muted-foreground"
                          aria-expanded={isExpanded}
                          onClick={() => toggleCategoryEntries(cat.clientId)}
                        >
                          {isExpanded ? "Hide" : "View"}{" "}
                          {categoryTransactions.length}{" "}
                          {categoryTransactions.length === 1
                            ? "entry"
                            : "entries"}
                          <ChevronRight
                            className={cn("size-4", isExpanded && "rotate-90")}
                          />
                        </Button>
                      )}
                      {isExpanded && categoryTransactions.length > 0 && (
                        <div className="mt-1">
                          <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground">
                            <span>Recent entries</span>
                            <span>{categoryTransactions.length}</span>
                          </div>
                          <div className="divide-y">
                            {visibleTransactions.map((tx) => (
                              <div
                                key={tx.clientId}
                                className="flex items-center gap-2 px-3 py-2"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">
                                    {expenseName(tx)}
                                  </p>
                                  <p className="text-xs tabular-nums text-muted-foreground">
                                    {formatTransactionDate(tx.date)}
                                  </p>
                                </div>
                                <span className="shrink-0 text-sm font-medium tabular-nums">
                                  {formatMoney(tx.amount)}
                                </span>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-11 shrink-0 text-muted-foreground hover:text-destructive"
                                  disabled={busy}
                                  onClick={() => handleDeleteTransaction(tx)}
                                  aria-label={`Remove ${expenseName(tx)} entry`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="activity">
          {" "}
          {/* Recent transactions for the viewed month */}
          {monthTransactions.length > 0 ? (
            <div>
              <h2 className="text-lg font-semibold mb-3">
                Transactions ({monthTransactions.length})
              </h2>
              <div className="divide-y">
                {sortedMonthTransactions.slice(0, activityLimit).map((tx) => (
                  <div
                    key={tx.clientId}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          txCategoryColorById.get(tx.categoryId) ?? "#6b7280",
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {expenseName(tx)}
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {txCategoryNameById.get(tx.categoryId) ??
                          "(deleted category)"}{" "}
                        · {formatTransactionDate(tx.date)}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">
                      {formatMoney(tx.amount)}
                    </span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-11 text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() => handleDeleteTransaction(tx)}
                      aria-label={`Remove ${expenseName(tx)} entry`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No expenses in {formatMonthKey(viewMonthKey)}. Add one to start
              tracking.
            </p>
          )}
          {sortedMonthTransactions.length > activityLimit && (
            <Button
              variant="outline"
              className="min-h-11 w-full"
              onClick={() => setActivityLimit((n) => n + 50)}
            >
              Show more expenses
            </Button>
          )}
        </TabsContent>
        <TabsContent value="bills">
          <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
            All unpaid bills, across months. Marking one paid logs an expense
            for today. Undo removes that expense.
          </p>{" "}
          {/* Bills to pay */}
          <section>
            <div className="pb-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4" />
                  Bills to pay
                  {unpaidBills.length > 0 && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {unpaidBills.length}
                    </span>
                  )}
                </h2>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11 gap-1.5"
                  onClick={() => setCreatingBill(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Bill
                </Button>
              </div>
            </div>
            <div>
              {unpaidBills.length === 0 && paidBills.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  Nothing on your plate. Add a bill to track what&apos;s coming
                  up.
                </p>
              ) : unpaidBills.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">
                  All caught up.
                </p>
              ) : (
                <div className="divide-y -mx-4 sm:-mx-6">
                  {unpaidBills.map((bill) => {
                    const overdue =
                      bill.dueDate &&
                      billDueDate(bill.dueDate) <
                        new Date(new Date().setHours(0, 0, 0, 0));
                    return (
                      <div
                        key={bill.clientId}
                        className="flex items-center gap-3 px-4 py-2.5 sm:px-6"
                      >
                        <button
                          onClick={() =>
                            void runMutation(() =>
                              handleMarkPaid(
                                bill.clientId,
                                bill.name,
                                bill.amount
                              )
                            )
                          }
                          aria-label={`Mark ${bill.name} paid`}
                          disabled={busy}
                          className="flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          <Circle
                            className={cn(
                              "pointer-events-none h-5 w-5",
                              overdue
                                ? "text-destructive"
                                : "text-muted-foreground"
                            )}
                          />
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {bill.name}
                          </p>
                          {bill.dueDate && (
                            <p
                              className={cn(
                                "text-xs flex items-center gap-1",
                                overdue
                                  ? "text-destructive"
                                  : "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="h-3 w-3" />
                              {new Date(
                                `${bill.dueDate}T12:00:00`
                              ).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                              {overdue && " · overdue"}
                            </p>
                          )}
                        </div>
                        <span className="text-sm font-semibold tabular-nums shrink-0">
                          {formatMoney(bill.amount)}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-11 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => {
                            if (confirm(`Remove "${bill.name}"?`))
                              void runMutation(() => removeBill(bill.clientId));
                          }}
                          disabled={busy}
                          aria-label={`Remove ${bill.name} bill`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {paidBills.length > 0 && (
                <div className="mt-2 border-t -mx-4 sm:-mx-6">
                  <button
                    aria-expanded={showPaidBills}
                    onClick={() => setShowPaidBills((v) => !v)}
                    className="flex w-full items-center justify-between px-4 sm:px-6 min-h-11 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <span>
                      {showPaidBills ? "Hide" : "Show"} paid ({paidBills.length}
                      )
                    </span>
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 transition-transform",
                        showPaidBills && "rotate-90"
                      )}
                    />
                  </button>
                  {showPaidBills && (
                    <div className="divide-y">
                      {paidBills.slice(0, 20).map((bill) => (
                        <div
                          key={bill.clientId}
                          className="flex items-center gap-3 px-4 py-2 sm:px-6 "
                        >
                          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm line-through truncate">
                              {bill.name}
                            </p>
                            {bill.paidAt && (
                              <p className="text-xs text-muted-foreground">
                                paid{" "}
                                {new Date(bill.paidAt).toLocaleDateString(
                                  undefined,
                                  { month: "short", day: "numeric" }
                                )}
                              </p>
                            )}
                          </div>
                          <span className="text-sm tabular-nums line-through shrink-0">
                            {formatMoney(bill.amount)}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-11 text-muted-foreground hover:text-foreground shrink-0"
                            disabled={busy}
                            onClick={() =>
                              void runMutation(() =>
                                handleUnmarkPaid(bill.clientId, bill.name)
                              )
                            }
                            aria-label={`Mark ${bill.name} unpaid`}
                            title="Undo paid (removes the budget transaction)"
                          >
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        </TabsContent>
      </Tabs>
      <Dialog open={editingIncome} onOpenChange={setEditingIncome}>
        <DialogContent className="sm:max-w-md [&_input]:min-h-11 [&_button]:min-h-11 [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2">
          <DialogHeader>
            <DialogTitle>Monthly income</DialogTitle>
            <DialogDescription>
              This amount is used across all months. Category limits are set
              separately for each month.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveIncome();
            }}
          >
            <Label htmlFor="income">Amount per month ($)</Label>
            <Input
              id="income"
              className="h-11"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              autoFocus
              placeholder="3000"
              value={incomeInput}
              onChange={(e) => setIncomeInput(e.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setEditingIncome(false)}
              >
                Cancel
              </Button>
              <Button type="submit" className="min-h-11">
                Save income
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* Add Bill dialog */}
      <Dialog
        open={creatingBill}
        onOpenChange={(open) => {
          if (!saving.current) setCreatingBill(open);
        }}
      >
        <DialogContent className="sm:max-w-md [&_input]:min-h-11 [&_button]:min-h-11 [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2">
          <DialogHeader>
            <DialogTitle>Add a Bill</DialogTitle>
            <DialogDescription>
              These don&apos;t deduct from your budget until you mark them paid.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="bill-name">Name</Label>
              <Input
                disabled={busy}
                id="bill-name"
                placeholder="Electric, Rent, Netflix…"
                value={newBillName}
                onChange={(e) => setNewBillName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label htmlFor="bill-amt">Amount ($)</Label>
                <Input
                  disabled={busy}
                  id="bill-amt"
                  type="number"
                  inputMode="decimal"
                  placeholder="80"
                  value={newBillAmount}
                  onChange={(e) => setNewBillAmount(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bill-due">Due (optional)</Label>
                <Input
                  disabled={busy}
                  id="bill-due"
                  type="date"
                  value={newBillDue}
                  onChange={(e) => setNewBillDue(e.target.value)}
                />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCreatingBill(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => void runMutation(handleAddBill)}
            >
              {busy ? "Saving..." : "Add bill"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* New category dialog */}
      <Dialog
        open={creatingCategory}
        onOpenChange={(open) => {
          if (!saving.current) setCreatingCategory(open);
        }}
      >
        <DialogContent className="sm:max-w-md [&_input]:min-h-11 [&_button]:min-h-11 [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2">
          <DialogHeader>
            <DialogTitle>New Budget Category</DialogTitle>
            <DialogDescription>
              Pick a name and limit for{" "}
              <strong>{formatMonthKey(viewMonthKey)}</strong>. Limits are
              per-month — next month starts fresh (or tap &ldquo;Use last
              month&rdquo;).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                disabled={busy}
                id="cat-name"
                placeholder="Clothes, Food, Subscriptions…"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cat-limit">
                Limit for {formatMonthKey(viewMonthKey)} ($)
              </Label>
              <Input
                disabled={busy}
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
                      "size-11 rounded-md border-2 transition-transform",
                      newCatColor === c ? "scale-105" : "border-transparent"
                    )}
                    style={{
                      backgroundColor: c,
                      borderColor: newCatColor === c ? "#fff" : "transparent",
                      outline:
                        newCatColor === c
                          ? "2px solid var(--foreground)"
                          : "none",
                      outlineOffset: "2px",
                    }}
                    disabled={busy}
                    aria-pressed={newCatColor === c}
                    aria-label={`Color ${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setCreatingCategory(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={() => void runMutation(handleAddCategory)}
            >
              {busy ? "Saving..." : "Add category"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Log spending dialog */}
      <Dialog
        open={expenseOpen}
        onOpenChange={(o) => !o && closeSpendingDialog()}
      >
        <DialogContent className="sm:max-w-md [&_input]:min-h-11 [&_button]:min-h-11 [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2">
          <DialogHeader>
            <DialogTitle>Add an expense</DialogTitle>
            <DialogDescription>
              Record a payment in {formatMonthKey(viewMonthKey)}. It counts
              toward the category you choose.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-category">Category</Label>
              <select
                disabled={busy}
                id="expense-category"
                className="h-11 w-full min-w-0 rounded-md border bg-background px-3 text-sm"
                value={spendingCategory?.clientId ?? ""}
                onChange={(e) =>
                  setSpendingCategory(
                    categories.find((c) => c.clientId === e.target.value) ??
                      null
                  )
                }
              >
                {categories.map((cat) => (
                  <option key={cat.clientId} value={cat.clientId}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                disabled={busy}
                id="expense-date"
                className="h-11"
                type="date"
                value={spendDate}
                onChange={(e) => setSpendDate(e.target.value)}
                min={`${viewMonthKey}-01`}
                max={`${viewMonthKey}-${new Date(
                  Number(viewMonthKey.slice(0, 4)),
                  Number(viewMonthKey.slice(5)),
                  0
                ).getDate()}`}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_9rem]">
            <div className="space-y-1.5">
              <Label htmlFor="spend-note">Expense name</Label>
              <Input
                disabled={busy}
                id="spend-note"
                placeholder="Groceries, gas, coffee…"
                value={spendNote}
                onChange={(e) => setSpendNote(e.target.value)}
                autoFocus
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">
                Optional. Blank entries show as Expense.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="spend-amt">Amount ($)</Label>
              <Input
                disabled={busy}
                id="spend-amt"
                type="number"
                inputMode="decimal"
                placeholder="60"
                value={spendAmount}
                onChange={(e) => setSpendAmount(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runMutation(handleAddSpending);
                  }
                }}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={closeSpendingDialog}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !spendingCategory || !spendAmount.trim()}
              onClick={() => void runMutation(handleAddSpending)}
            >
              {busy ? "Saving..." : "Save expense"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Per-month limit override dialog */}
      <Dialog
        open={!!limitEditingCategory}
        onOpenChange={(o) => {
          if (!o && !saving.current) setLimitEditingCategory(null);
        }}
      >
        <DialogContent className="sm:max-w-md [&_input]:min-h-11 [&_button]:min-h-11 [&_[data-slot=dialog-close]]:size-11 [&_[data-slot=dialog-close]]:top-2 [&_[data-slot=dialog-close]]:right-2">
          <DialogHeader>
            <DialogTitle>Limit for {formatMonthKey(viewMonthKey)}</DialogTitle>
            <DialogDescription>
              {limitEditingCategory && (
                <>
                  Set a custom limit for{" "}
                  <strong>{limitEditingCategory.name}</strong> this month only.
                  The default ({formatMoney(limitEditingCategory.monthlyLimit)})
                  keeps applying to every other month. Leave blank or enter 0 to use the default.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="limit-amt">Limit for this month ($)</Label>
              <Input
                disabled={busy}
                id="limit-amt"
                type="number"
                inputMode="decimal"
                placeholder={
                  limitEditingCategory
                    ? String(limitEditingCategory.monthlyLimit)
                    : ""
                }
                value={limitInput}
                onChange={(e) => setLimitInput(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                Default:{" "}
                {limitEditingCategory
                  ? formatMoney(limitEditingCategory.monthlyLimit)
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            {limitEditingCategory?.hasOverride ? (
              <Button
                variant="ghost"
                className="gap-1.5 text-muted-foreground"
                disabled={busy}
                onClick={() =>
                  void runMutation(async () => {
                    if (!limitEditingCategory) return;
                    await setCategoryLimitForMonth(
                      limitEditingCategory.clientId,
                      null
                    );
                    toast.success("Reverted to default limit");
                    setLimitEditingCategory(null);
                    setLimitInput("");
                  })
                }
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Revert
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setLimitEditingCategory(null)}
              >
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={() => void runMutation(handleSaveLimit)}
              >
                {busy ? "Saving..." : "Save"}
              </Button>
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
          {/* All-time stats */}
          {allTime.monthsTracked > 0 && (
            <section className="border-b pb-4">
              <div className="flex items-center gap-2 mb-3 text-sm font-medium text-muted-foreground">
                All time
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Months tracked
                  </p>
                  <p className="text-lg font-semibold tabular-nums">
                    {allTime.monthsTracked}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total spent</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(allTime.totalSpent)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg / month</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(allTime.avgPerMonth)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Top category</p>
                  <p
                    className="text-lg font-semibold truncate"
                    title={allTime.topCategoryName ?? "—"}
                  >
                    {allTime.topCategoryName ?? "—"}
                  </p>
                </div>
              </div>
            </section>
          )}

          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            {availableMonths.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No months tracked yet.
              </p>
            ) : (
              <div className="divide-y">
                {monthSummaries.map((m) => (
                  <button
                    key={m.monthKey}
                    onClick={() => {
                      setViewMonthKey(m.monthKey);
                      setHistoryOpen(false);
                    }}
                    className="flex w-full items-center justify-between py-3 text-left hover:bg-muted/50 -mx-2 px-2 rounded"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {formatMonthKey(m.monthKey)}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {m.topCategoryName ? (
                          <>
                            Top: {m.topCategoryName} ·{" "}
                            {formatMoney(m.topCategorySpent)}
                          </>
                        ) : (
                          "No spending"
                        )}
                      </p>
                    </div>
                    <span className="tabular-nums font-medium">
                      {formatMoney(m.totalSpent)}
                    </span>
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
