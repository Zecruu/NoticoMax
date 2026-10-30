"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { useItems } from "@/hooks/use-items";
import { useFolders } from "@/hooks/use-folders";
import { type LocalItem } from "@/lib/db/indexed-db";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchCommand } from "@/components/items/search-bar";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { useLicense } from "@/hooks/use-license";
import { AuthGate } from "@/components/auth-gate";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/native-toast";
import { reminderTiming } from "@/lib/items/reminder-schedule";

function ViewLoading() {
  return <div role="status" className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="size-4 animate-spin" />Opening…</div>;
}

const ItemList = dynamic(() => import("@/components/items/item-list").then((m) => m.ItemList), { loading: ViewLoading });
const ItemDialog = dynamic(() => import("@/components/items/item-dialog").then((m) => m.ItemDialog), { loading: ViewLoading });
const TrashView = dynamic(() => import("@/components/items/trash-view").then((m) => m.TrashView), { loading: ViewLoading });
const CalendarView = dynamic(() => import("@/components/calendar/calendar-view").then((m) => m.CalendarView), { loading: ViewLoading });
const StudyView = dynamic(() => import("@/components/study/study-view").then((m) => m.StudyView), { loading: ViewLoading });
const PasswordsView = dynamic(() => import("@/components/passwords/passwords-view").then((m) => m.PasswordsView), { loading: ViewLoading });
const SkillsView = dynamic(() => import("@/components/skills/skills-view").then((m) => m.SkillsView), { loading: ViewLoading });
const BudgetView = dynamic(() => import("@/components/budget/budget-view").then((m) => m.BudgetView), { loading: ViewLoading });
const GoalsView = dynamic(() => import("@/components/goals/goals-view").then((m) => m.GoalsView), { loading: ViewLoading });
const LocationsView = dynamic(() => import("@/components/locations/locations-view").then((m) => m.LocationsView), { loading: ViewLoading });
const FamilyView = dynamic(() => import("@/components/family/family-view").then((m) => m.FamilyView), { loading: ViewLoading });

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [familyListToOpen, setFamilyListToOpen] = useState<{ id: string; folderId: string } | null>(null);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  // Initial view = the new dashboard tile grid. The user's previous view is
  // intentionally NOT persisted: every fresh launch lands on the calm
  // dashboard, not whichever sub-page they were last on.
  const [activeView, setActiveView] = useState("dashboard");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LocalItem | null>(null);
  const [defaultType, setDefaultType] = useState<"note" | "url" | "reminder">("note");
  const [defaultReminderDate, setDefaultReminderDate] = useState<string | undefined>(undefined);
  const [skippedActivation, setSkippedActivation] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const { isActivated, isPro, isLoading, isLoggedIn, userId, entitlements, login, loginWithApple, register } = useLicense();

  const { folders, addFolder, editFolder, removeFolder } = useFolders();
  const {
    items,
    allItems,
    trashedItems,
    loading,
    syncing,
    addItem,
    editItem,
    removeItem,
    togglePin,
    restoreItem,
    permanentlyDeleteItem,
    syncNow,
  } = useItems(activeFilter, searchQuery, activeFolder, isPro, isLoggedIn ? userId : null);

  // Counts for sidebar (type-based, ignoring folder filter)
  const itemCounts = useMemo(() => {
    const counts: Record<string, number> = { note: 0, url: 0, reminder: 0 };
    for (const item of allItems.filter((row) => !row.householdId)) {
      counts[item.type] = (counts[item.type] || 0) + 1;
    }
    return counts;
  }, [allItems]);

  // Collect all unique tags from items
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const item of allItems.filter((row) => !row.householdId)) {
      for (const tag of item.tags) {
        tagSet.add(tag);
      }
    }
    return Array.from(tagSet).sort();
  }, [allItems]);

  // Filter items by active tag
  const displayedItems = useMemo(() => {
    const personal = items.filter((item) => !item.householdId);
    if (!activeTag) return personal;
    return personal.filter((item) => item.tags.includes(activeTag));
  }, [items, activeTag]);

  // Get reminder items for calendar
  const reminderItems = useMemo(() => {
    return allItems.filter((item) => !item.householdId && item.type === "reminder" && item.reminderDate);
  }, [allItems]);

  // Reminders due in the next 7 days (and not yet completed). Powers the
  // Calendar tile's count + the Reminders tile's "X upcoming" subline.
  const [reminderNow, setReminderNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setReminderNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const upcomingReminderCount = useMemo(() => {
    const now = reminderNow;
    const weekFromNow = now + 7 * 24 * 60 * 60 * 1000;
    return reminderItems.filter((item) => {
      if (item.reminderCompleted) return false;
      const date = reminderTiming(item, new Date(now)).date;
      return !!date && date.getTime() >= now && date.getTime() <= weekFromNow;
    }).length;
  }, [reminderItems, reminderNow]);

  // Counts per folder
  const folderItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of allItems) {
      if (item.folderId) {
        counts[item.folderId] = (counts[item.folderId] || 0) + 1;
      }
    }
    return counts;
  }, [allItems]);

  const handleCreateNew = useCallback(() => {
    setEditingItem(null);
    setDefaultType("note");
    setDefaultReminderDate(undefined);
    setDialogOpen(true);
  }, []);

  // Allows standalone primary footer navs (for example Lyte) to jump back into
  // the dashboard's state-only views without adding real routes for each tab.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const params = new URLSearchParams(window.location.search);
      const filter = params.get("filter");
      const view = params.get("view");
      const shouldCreate = params.get("new") === "1";
      let consumed = false;

      if (filter === "note" || filter === "url") {
        setActiveFolder(null);
        setActiveFilter(filter);
        setActiveView("list");
        consumed = true;
      } else if (view === "budget" || view === "family") {
        setActiveFolder(null);
        setActiveFilter("all");
        setActiveView(view);
        consumed = true;
      }

      if (shouldCreate) {
        handleCreateNew();
        consumed = true;
      }

      if (consumed) {
        window.history.replaceState(null, "", window.location.pathname);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [handleCreateNew]);

  const handleCreateWithType = useCallback((type: "note" | "url" | "reminder") => {
    setEditingItem(null);
    setDefaultType(type);
    setDefaultReminderDate(undefined);
    setDialogOpen(true);
  }, []);

  const handleCreateReminderOnDate = useCallback((date?: Date) => {
    setEditingItem(null);
    setDefaultType("reminder");
    if (date) {
      // Default time = 9:00 AM on the picked date. Format for <input type="datetime-local">.
      const d = new Date(date);
      d.setHours(9, 0, 0, 0);
      const pad = (n: number) => String(n).padStart(2, "0");
      setDefaultReminderDate(
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
      );
    } else {
      setDefaultReminderDate(undefined);
    }
    setDialogOpen(true);
  }, []);

  const handleEdit = useCallback((item: LocalItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(
    async (item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">) => {
      await addItem(item);
      toast.success(item.type === "url" ? "Link saved" : item.type === "reminder" ? "Reminder saved" : "Note saved");
    },
    [addItem]
  );

  const handleUpdate = useCallback(
    async (clientId: string, updates: Partial<LocalItem>) => {
      await editItem(clientId, updates);
      toast.success("Changes saved");
    },
    [editItem]
  );

  // Silent content update (no toast) — used when tapping checklist circles
  // in the card view. A toast every tap would be annoying for a 10-item list.
  const handleContentUpdate = useCallback(
    async (clientId: string, content: string) => {
      await editItem(clientId, { content });
    },
    [editItem]
  );

  const handleDelete = useCallback(
    async (clientId: string) => {
      await removeItem(clientId);
      toast.success("Item deleted");
    },
    [removeItem]
  );

  const handleTogglePin = useCallback(
    async (clientId: string, pinned: boolean) => {
      await togglePin(clientId, pinned);
      toast.success(pinned ? "Unpinned" : "Pinned");
    },
    [togglePin]
  );

  const handleToggleComplete = useCallback(
    async (clientId: string, completed: boolean) => {
      await editItem(clientId, { reminderCompleted: !completed });
      toast.success(!completed ? "Marked complete" : "Marked incomplete");
    },
    [editItem]
  );

  const handleSearchSelect = useCallback((item: LocalItem) => {
    if (item.isChecklist && item.householdId && item.folderId) {
      setFamilyListToOpen({ id: item.clientId, folderId: item.folderId });
      setActiveFolder(item.folderId); setActiveView("list"); setDialogOpen(false); return;
    }
    setEditingItem(item);
    setDialogOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NOTICO MAX" className="h-12 w-12 mx-auto" />
          <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!isLoggedIn && !skippedActivation) {
    return <AuthGate onLogin={login} onLoginWithApple={loginWithApple} onRegister={register} onSkip={() => setSkippedActivation(true)} />;
  }

  return (
    <div className="app-viewport flex flex-col overflow-hidden">
      <Header
        searchQuery={searchQuery}
        onSearchChange={(query) => {
          setSearchQuery(query);
          if (query.trim()) {
            setActiveFilter("all");
            setActiveFolder(null);
            setActiveTag(null);
            setActiveView("list");
          }
        }}
        syncing={syncing}
        onSync={syncNow}
        isActivated={isActivated}
        onMenuClick={() => setSidebarOpen(true)}
      />

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 md:hidden">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <Sidebar
            wrapperClassName="flex h-full w-full flex-col bg-background"
            activeFilter={activeFilter}
            activeFolder={activeFolder}
            onFilterChange={(v) => { setActiveFilter(v); setSidebarOpen(false); }}
            onFolderChange={(v) => { setActiveFolder(v); setSidebarOpen(false); }}
            onCreateNew={() => { handleCreateNew(); setSidebarOpen(false); }}
            itemCounts={itemCounts}
            folders={folders}
            folderItemCounts={folderItemCounts}
            onAddFolder={addFolder}
            onEditFolder={editFolder}
            onRemoveFolder={removeFolder}
            activeView={activeView}
            onViewChange={(v) => { setActiveView(v); setSidebarOpen(false); }}
            trashCount={trashedItems.length}
            allTags={allTags}
            activeTag={activeTag}
            onTagChange={(v) => { setActiveTag(v); setSidebarOpen(false); }}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <Sidebar
          activeFilter={activeFilter}
          activeFolder={activeFolder}
          onFilterChange={setActiveFilter}
          onFolderChange={setActiveFolder}
          onCreateNew={handleCreateNew}
          itemCounts={itemCounts}
          folders={folders}
          folderItemCounts={folderItemCounts}
          onAddFolder={addFolder}
          onEditFolder={editFolder}
          onRemoveFolder={removeFolder}
          activeView={activeView}
          onViewChange={setActiveView}
          trashCount={trashedItems.length}
          allTags={allTags}
          activeTag={activeTag}
          onTagChange={setActiveTag}
        />

        <main className="min-w-0 flex-1 overflow-auto overscroll-contain pb-[var(--bottom-nav-height)]">
          {activeView === "dashboard" ? (
            <DashboardHome
              noteCount={itemCounts.note ?? 0}
              urlCount={itemCounts.url ?? 0}
              reminderCount={itemCounts.reminder ?? 0}
              upcomingReminderCount={upcomingReminderCount}
              onOpenNotes={() => { setActiveFilter("note"); setActiveView("list"); }}
              onOpenUrls={() => { setActiveFilter("url"); setActiveView("list"); }}
              onOpenReminders={() => { setActiveFilter("reminder"); setActiveView("list"); }}
              onOpenCalendar={() => setActiveView("calendar")}
              onOpenBudget={() => setActiveView("budget")}
              onOpenGoals={() => setActiveView("goals")}
              onOpenLocations={() => setActiveView("locations")}
              onOpenPasswords={() => setActiveView("passwords")}
              onOpenFamily={() => setActiveView("family")}
              onCreateNew={handleCreateNew}
              familyPlanActive={entitlements?.familyPlanActive}
            />
          ) : activeView === "trash" ? (
            <TrashView
              items={trashedItems}
              onRestore={restoreItem}
              onPermanentDelete={permanentlyDeleteItem}
            />
          ) : activeView === "calendar" ? (
            <CalendarView
              items={reminderItems}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleComplete={handleToggleComplete}
              onCreateReminder={handleCreateReminderOnDate}
            />
          ) : activeView === "study" ? (
            <StudyView />
          ) : activeView === "passwords" ? (
            <PasswordsView />
          ) : activeView === "envvars" ? (
            <PasswordsView initialTab="envvars" />
          ) : activeView === "skills" ? (
            <SkillsView tool="claude" />
          ) : activeView === "codex-skills" ? (
            <SkillsView tool="codex" />
          ) : activeView === "budget" ? (
            <BudgetView />
          ) : activeView === "goals" ? (
            <GoalsView />
          ) : activeView === "locations" ? (
            <LocationsView />
          ) : activeView === "family" || (activeFolder && folders.find((f) => f.clientId === activeFolder)?.householdId) ? (
            <FamilyView key={activeView === "family" ? "family" : activeFolder} folders={folders}
              initialFolderId={activeView === "family" ? undefined : activeFolder ?? undefined}
              initialListId={activeView !== "family" && familyListToOpen?.folderId === activeFolder ? familyListToOpen.id : undefined}
              onCreateItem={(type, folderId) => { setActiveFolder(folderId); handleCreateWithType(type); }}
              onEditItem={handleEdit}
              onPersonal={() => { setFamilyListToOpen(null); setActiveFolder(null); setActiveFilter("all"); setActiveView("list"); }} />
          ) : (
            <ItemList
              items={displayedItems}
              folders={folders}
              loading={loading}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onToggleComplete={handleToggleComplete}
              onUpdateContent={handleContentUpdate}
              activeFilter={activeFilter}
              activeFolder={activeFolder}
              onCreateWithType={handleCreateWithType}
              onCreateNew={handleCreateNew}
              searchQuery={searchQuery}
              activeTag={activeTag}
              onClearSearch={() => setSearchQuery("")}
            />
          )}
        </main>
      </div>

      <MobileNav
        activeFilter={activeFilter}
        activeFolder={activeFolder}
        onFilterChange={setActiveFilter}
        onFolderChange={setActiveFolder}
        onCreateNew={handleCreateNew}
        folders={folders}
        folderItemCounts={folderItemCounts}
        onAddFolder={addFolder}
        onEditFolder={editFolder}
        onRemoveFolder={removeFolder}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {dialogOpen && <ItemDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingItem(null);
        }}
        onSave={handleSave}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        editingItem={editingItem}
        folders={folders}
        defaultFolderId={activeFolder}
        defaultType={defaultType}
        defaultReminderDate={defaultReminderDate}
        allTags={allTags}
      />}

      <SearchCommand onSelect={handleSearchSelect} />
    </div>
  );
}
