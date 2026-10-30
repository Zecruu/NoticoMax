"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, { type LocalFolder, type LocalItem } from "@/lib/db/indexed-db";
import { useHouseholds } from "@/hooks/use-households";
import { useLicense } from "@/hooks/use-license";
import { useBudget } from "@/hooks/use-budget";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HeartHandshake,
  FileText,
  Bell,
  Link2,
  Wallet,
  Plus,
  Copy,
  Users,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";
import { ItemCard } from "@/components/items/item-card";
import { deleteItem, updateItem } from "@/lib/sync/sync-engine";
import { FamilyCheckins } from "./family-checkins";

interface FamilyFolderViewProps {
  folder: LocalFolder;
  /** Triggered when the user wants to create a new item inside the family folder. */
  onCreateItem: (type: "note" | "url" | "reminder", folderId: string) => void;
  /** Triggered when the user taps an item card to edit. */
  onEditItem: (item: LocalItem) => void;
  /** Triggered when the user wants to jump to the full Budget view. */
  onOpenBudget: () => void;
}

export function FamilyFolderView({
  folder,
  onCreateItem,
  onEditItem,
  onOpenBudget,
}: FamilyFolderViewProps) {
  const { households } = useHouseholds();
  const household = households.find((h) => h.id === folder.householdId);

  const { isPro } = useLicense();
  const canWrite = folder.canWrite === true;

  // A family may have restricted folders. Never mix another folder's items
  // into this view or accidentally edit them with this folder's permissions.
  const allItems = useLiveQuery(
    () =>
      db.items
        .toArray()
        .then((rows) =>
          rows
            .filter((i) => !i.deleted && i.folderId === folder.clientId && i.householdId === folder.householdId)
            .sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            }),
        ),
    [folder.clientId, folder.householdId],
    [] as LocalItem[],
  );

  // Credentials are deliberately not surfaced in this shared notes view.
  const buckets = useMemo(() => {
    const items = allItems ?? [];
    return {
      notes: items.filter((i) => i.type === "note"),
      reminders: items.filter((i) => i.type === "reminder"),
      urls: items.filter((i) => i.type === "url"),
    };
  }, [allItems]);

  const { categories: budgetCategories, monthlyIncome } = useBudget();
  const householdBudgetCats = (budgetCategories ?? []).filter(
    (c) => c.householdId === folder.householdId,
  );

  const copyCode = async () => {
    if (!household?.familyCode) return;
    try {
      await navigator.clipboard.writeText(household.familyCode);
      toast.success(`Code ${household.familyCode} copied`);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  const itemActions = {
    onEdit: (item: LocalItem) => {
      if (canWrite) onEditItem(item);
      else toast.error("This folder is read-only. Ask its owner for edit access.");
    },
    onDelete: async (clientId: string) => {
      if (!canWrite || !confirm("Delete this shared item for everyone with access?")) return;
      await deleteItem(clientId);
    },
    onTogglePin: async (clientId: string, pinned: boolean) => {
      if (canWrite) await updateItem(clientId, { pinned: !pinned });
    },
    onToggleComplete: canWrite ? async (clientId: string, completed: boolean) => {
      await updateItem(clientId, { reminderCompleted: !completed });
    } : undefined,
    onUpdateContent: canWrite ? async (clientId: string, content: string) => {
      await updateItem(clientId, { content });
    } : undefined,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: (folder.color || "#10B981") + "25" }}
        >
          <HeartHandshake className="h-5 w-5" style={{ color: folder.color || "#10B981" }} />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight truncate">{folder.name}</h1>
          <p className="text-sm text-muted-foreground">
            Family of {household?.members.length ?? "?"} member
            {household?.members.length === 1 ? "" : "s"}. Anything you add below is visible to
            members with access to this folder.
          </p>
        </div>
      </div>

      {/* Family code + members summary */}
      {household && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-3.5 w-3.5" />
              {household.members.length} of {household.maxSeats} seats
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center gap-2">
              <code className="flex-1 font-mono text-base font-bold tracking-[0.18em]">
                {household.familyCode}
              </code>
              <Button size="sm" variant="outline" onClick={() => void copyCode()} className="gap-1 shrink-0">
                <Copy className="h-3.5 w-3.5" />
                Copy code
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Share this code so others can request to join; the owner must approve. They paste it in Settings → Family → Join.
            </p>
          </CardContent>
        </Card>
      )}

      {!canWrite && <p className="rounded-md border p-3 text-sm text-muted-foreground">You have read-only access to this folder.</p>}

      {household && <FamilyCheckins key={household.id} household={household} />}

      {/* Notes */}
      <Section
        icon={<FileText className="h-4 w-4 text-blue-500" />}
        title="Notes"
        count={buckets.notes.length}
        onAdd={canWrite ? () => onCreateItem("note", folder.clientId) : undefined}
      >
        {buckets.notes.length === 0 ? (
          <EmptyHint text="Tap + to add a shared note." />
        ) : (
          buckets.notes.map((it) => (
            <ItemCard key={it.clientId} item={it} folder={folder} {...itemActions} />
          ))
        )}
      </Section>

      <p className="text-xs text-muted-foreground">Shared reminders sync while the app is connected. Device alerts require notification permission and are not emergency alerts; background or arrival alerts are not included.</p>
      {/* Reminders */}
      <Section
        icon={<Bell className="h-4 w-4 text-amber-500" />}
        title="Reminders"
        count={buckets.reminders.length}
        onAdd={canWrite ? () => onCreateItem("reminder", folder.clientId) : undefined}
      >
        {buckets.reminders.length === 0 ? (
          <EmptyHint text="Tap + to add a shared reminder." />
        ) : (
          buckets.reminders.map((it) => (
            <ItemCard key={it.clientId} item={it} folder={folder} {...itemActions} />
          ))
        )}
      </Section>

      {/* URLs */}
      <Section
        icon={<Link2 className="h-4 w-4 text-purple-500" />}
        title="URLs"
        count={buckets.urls.length}
        onAdd={canWrite ? () => onCreateItem("url", folder.clientId) : undefined}
      >
        {buckets.urls.length === 0 ? (
          <EmptyHint text="Tap + to share a bookmark." />
        ) : (
          buckets.urls.map((it) => (
            <ItemCard key={it.clientId} item={it} folder={folder} {...itemActions} />
          ))
        )}
      </Section>

      {/* Existing paid budget tools remain separate from free Family. */}
      {isPro && <Section
        icon={<Wallet className="h-4 w-4 text-emerald-500" />}
        title="Budget"
        count={householdBudgetCats.length}
        actionLabel="Open"
        onAdd={onOpenBudget}
      >
        {householdBudgetCats.length === 0 ? (
          <EmptyHint text="Open the full Budget view to add a category and toggle it as Shared with this family." />
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-1">
              Monthly income: <span className="font-medium text-foreground">${monthlyIncome.toFixed(0)}</span>
            </p>
            {householdBudgetCats.map((cat) => (
              <Card key={cat.clientId} className="p-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                  <p className="flex-1 text-sm font-medium truncate">{cat.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    ${cat.spentInMonth.toFixed(0)} / ${cat.effectiveLimit.toFixed(0)}
                  </p>
                </div>
              </Card>
            ))}
          </>
        )}
      </Section>}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function Section({
  icon,
  title,
  count,
  onAdd,
  actionLabel,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  onAdd?: () => void;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
          <span className={cn("text-xs text-muted-foreground tabular-nums")}>{count}</span>
        </h2>
        {onAdd && <Button size="sm" variant="ghost" onClick={onAdd} className="gap-1 h-7 px-2">
          {actionLabel === "Open" ? <ExternalLink className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {actionLabel ?? "Add"}
        </Button>}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground/70 px-3 py-2">{text}</p>;
}
