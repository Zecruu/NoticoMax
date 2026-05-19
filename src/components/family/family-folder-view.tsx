"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import db, { type LocalFolder, type LocalItem } from "@/lib/db/indexed-db";
import { useHouseholds } from "@/hooks/use-households";
import { useBudget } from "@/hooks/use-budget";
import { useLocations } from "@/hooks/use-locations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HeartHandshake,
  FileText,
  Bell,
  Link2,
  Key,
  MapPin,
  Wallet,
  Plus,
  Copy,
  Users,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";
import { ItemCard } from "@/components/items/item-card";
import { createLocation } from "@/lib/sync/sync-engine";
import { getCurrentCoords, mapsUrl, formatCoords } from "@/lib/geolocation";

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

  // All items belonging to this household (regardless of folder — covers items
  // that lived in this folder before household_id inheritance shipped, and any
  // future items in other shared folders for the same household).
  const allItems = useLiveQuery(
    () =>
      db.items
        .toArray()
        .then((rows) =>
          rows
            .filter((i) => !i.deleted && i.householdId === folder.householdId)
            .sort((a, b) => {
              if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
              return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
            }),
        ),
    [folder.householdId],
    [] as LocalItem[],
  );

  // Bucket by type so we can render Notes, Reminders, URLs, Passwords as
  // separate sections.
  const buckets = useMemo(() => {
    const items = allItems ?? [];
    return {
      notes: items.filter((i) => i.type === "note"),
      reminders: items.filter((i) => i.type === "reminder"),
      urls: items.filter((i) => i.type === "url"),
      passwords: items.filter((i) => i.type === "credential"),
    };
  }, [allItems]);

  const { categories: budgetCategories, monthlyIncome } = useBudget();
  const householdBudgetCats = (budgetCategories ?? []).filter(
    (c) => c.householdId === folder.householdId,
  );

  const { locations } = useLocations();
  const householdLocations = (locations ?? []).filter(
    (l) => l.householdId === folder.householdId,
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

  const captureLocationHere = async () => {
    try {
      const coords = await getCurrentCoords();
      const stamp = new Date().toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
      await createLocation({
        name: `${household?.name ?? "Family"} · ${stamp}`,
        latitude: coords.latitude,
        longitude: coords.longitude,
        tags: [],
        pinned: false,
        householdId: folder.householdId,
      });
      toast.success("Location shared with the family");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't capture location");
    }
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
            Shared with {household?.members.length ?? "?"} member
            {household?.members.length === 1 ? "" : "s"}. Anything you add below is visible to
            everyone in the family.
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
              Share this code so others can join. They paste it in Settings → Family → Join.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      <Section
        icon={<FileText className="h-4 w-4 text-blue-500" />}
        title="Notes"
        count={buckets.notes.length}
        onAdd={() => onCreateItem("note", folder.clientId)}
      >
        {buckets.notes.length === 0 ? (
          <EmptyHint text="Tap + to add a shared note." />
        ) : (
          buckets.notes.map((it) => (
            <ItemCard key={it.clientId} item={it} folder={folder} onEdit={onEditItem} onDelete={noop} onTogglePin={noop} />
          ))
        )}
      </Section>

      {/* Reminders */}
      <Section
        icon={<Bell className="h-4 w-4 text-amber-500" />}
        title="Reminders"
        count={buckets.reminders.length}
        onAdd={() => onCreateItem("reminder", folder.clientId)}
      >
        {buckets.reminders.length === 0 ? (
          <EmptyHint text="Tap + to add a shared reminder." />
        ) : (
          buckets.reminders.map((it) => (
            <ItemCard key={it.clientId} item={it} folder={folder} onEdit={onEditItem} onDelete={noop} onTogglePin={noop} />
          ))
        )}
      </Section>

      {/* URLs */}
      <Section
        icon={<Link2 className="h-4 w-4 text-purple-500" />}
        title="URLs"
        count={buckets.urls.length}
        onAdd={() => onCreateItem("url", folder.clientId)}
      >
        {buckets.urls.length === 0 ? (
          <EmptyHint text="Tap + to share a bookmark." />
        ) : (
          buckets.urls.map((it) => (
            <ItemCard key={it.clientId} item={it} folder={folder} onEdit={onEditItem} onDelete={noop} onTogglePin={noop} />
          ))
        )}
      </Section>

      {/* Passwords (credential items) */}
      <Section
        icon={<Key className="h-4 w-4 text-green-500" />}
        title="Passwords"
        count={buckets.passwords.length}
        onAdd={() => toast.success("Open Settings → Passwords to add a credential — household tagging coming in a follow-up")}
      >
        {buckets.passwords.length === 0 ? (
          <EmptyHint text="Add passwords from the Passwords view — they'll appear here when tagged with this family." />
        ) : (
          buckets.passwords.map((it) => (
            <ItemCard key={it.clientId} item={it} folder={folder} onEdit={onEditItem} onDelete={noop} onTogglePin={noop} />
          ))
        )}
      </Section>

      {/* Locations */}
      <Section
        icon={<MapPin className="h-4 w-4 text-red-500" />}
        title="Locations"
        count={householdLocations.length}
        onAdd={() => void captureLocationHere()}
      >
        {householdLocations.length === 0 ? (
          <EmptyHint text="Tap + to capture your current spot and share it with the family." />
        ) : (
          householdLocations.map((loc) => (
            <Card key={loc.clientId} className="p-3">
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{loc.name}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatCoords(loc.latitude, loc.longitude)}
                  </p>
                </div>
                <a
                  href={mapsUrl(loc.latitude, loc.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary hover:bg-primary/20 px-2 py-1 text-xs"
                >
                  <ExternalLink className="h-3 w-3" />
                  Maps
                </a>
              </div>
            </Card>
          ))
        )}
      </Section>

      {/* Budget */}
      <Section
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
      </Section>
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
  onAdd: () => void;
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
        <Button size="sm" variant="ghost" onClick={onAdd} className="gap-1 h-7 px-2">
          {actionLabel === "Open" ? <ExternalLink className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {actionLabel ?? "Add"}
        </Button>
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground/70 px-3 py-2">{text}</p>;
}

function noop() {}
