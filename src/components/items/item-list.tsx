"use client";

import { useMemo, useState } from "react";
import { type LocalItem, type LocalFolder } from "@/lib/db/indexed-db";
import { ItemCard } from "./item-card";
import { Button } from "@/components/ui/button";
import { Bell, ChevronLeft, FileText, FolderOpen, Inbox, Link2, Plus } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getUrlCategoryLabel } from "@/lib/url-categories";

interface ItemListProps {
  items: LocalItem[];
  folders: LocalFolder[];
  loading: boolean;
  onEdit: (item: LocalItem) => void;
  onDelete: (clientId: string) => void;
  onTogglePin: (clientId: string, pinned: boolean) => void;
  onToggleComplete: (clientId: string, completed: boolean) => void;
  onUpdateContent?: (clientId: string, content: string) => void;
  activeFilter: string;
  activeFolder: string | null;
  onCreateWithType?: (type: "note" | "url" | "reminder") => void;
  onCreateNew?: () => void;
  onBackToFolders?: () => void;
}

const emptyMessages: Record<string, { icon: React.ElementType; message: string }> = {
  all: { icon: Inbox, message: "No items yet. Create your first note, bookmark, or reminder!" },
  note: { icon: FileText, message: "No notes yet. Start writing!" },
  url: { icon: Link2, message: "No bookmarks yet. Save your favorite URLs!" },
  reminder: { icon: Bell, message: "No reminders yet. Set one up!" },
  folder: { icon: FolderOpen, message: "This folder is empty. Add items to it!" },
};

const addButtonConfig: Record<string, { label: string; type: "note" | "url" | "reminder"; icon: React.ElementType }> = {
  note: { label: "Add Note", type: "note", icon: FileText },
  url: { label: "Add URL", type: "url", icon: Link2 },
  reminder: { label: "Add Reminder", type: "reminder", icon: Bell },
};

export function ItemList({
  items,
  folders,
  loading,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleComplete,
  onUpdateContent,
  activeFilter,
  activeFolder,
  onCreateWithType,
  onCreateNew,
  onBackToFolders,
}: ItemListProps) {
  const [activeCategory, setActiveCategory] = useState("all");
  // Build a folder lookup map
  const folderMap = new Map(folders.map((f) => [f.clientId, f]));
  const categoryOptions = useMemo(() => {
    const categories = new Set(
      items
        .filter((item) => item.type === "url")
        .map((item) => getUrlCategoryLabel(item.tags)),
    );
    if (activeCategory !== "all") categories.add(activeCategory);
    return Array.from(categories).sort((a, b) => a.localeCompare(b));
  }, [activeCategory, items]);
  const visibleItems = useMemo(() => {
    if (activeFilter !== "url" || activeCategory === "all") return items;
    return items.filter(
      (item) => item.type === "url" && getUrlCategoryLabel(item.tags) === activeCategory,
    );
  }, [activeCategory, activeFilter, items]);
  const addBtn = addButtonConfig[activeFilter];
  const activeFolderRecord = activeFolder ? folderMap.get(activeFolder) : undefined;
  const pageTitle = activeFolderRecord?.name ?? ({
    all: "All items",
    note: "Notes",
    url: "URLs",
    reminder: "Reminders",
  }[activeFilter] || "Items");
  const countLabel = `${visibleItems.length} ${
    activeFilter === "note"
      ? visibleItems.length === 1 ? "note" : "notes"
      : activeFilter === "url"
        ? visibleItems.length === 1 ? "bookmark" : "bookmarks"
        : activeFilter === "reminder"
          ? visibleItems.length === 1 ? "reminder" : "reminders"
          : visibleItems.length === 1 ? "item" : "items"
  }`;
  const emptyKey = activeFolder ? "folder" : activeFilter;
  const empty = emptyMessages[emptyKey] || emptyMessages.all;
  const EmptyIcon = empty.icon;

  return (
    <div className="pb-4 md:space-y-4 md:p-6">
      <div className="px-4 py-4 md:px-0 md:py-0">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1">
            {activeFilter === "note" && activeFolder && onBackToFolders && (
              <button
                type="button"
                onClick={onBackToFolders}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
                aria-label="Back to folders"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-xl font-semibold md:text-2xl">{pageTitle}</h1>
              <p className="text-xs text-muted-foreground">{loading ? "Loading…" : countLabel}</p>
            </div>
          </div>
          <div className="hidden md:flex">
            {activeFolder && onCreateNew && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreateNew}>
                <Plus className="h-3.5 w-3.5" />
                {addBtn?.label ?? "Add Item"}
              </Button>
            )}
            {!activeFolder && addBtn && onCreateWithType && (
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onCreateWithType(addBtn.type)}>
                <Plus className="h-3.5 w-3.5" />
                {addBtn.label}
              </Button>
            )}
          </div>
        </div>
        {activeFilter === "url" && (
          <div className="mt-2">
            <Select value={activeCategory} onValueChange={setActiveCategory}>
              <SelectTrigger className="h-9 w-[min(12rem,65vw)]" aria-label="Filter bookmarks by category">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>{category}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="divide-y border-y md:grid md:grid-cols-2 md:gap-3 md:divide-y-0 md:border-0 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse bg-muted/50 md:h-32 md:rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20 text-center text-muted-foreground">
          <EmptyIcon className="mb-4 h-10 w-10 opacity-40" />
          <p className="text-sm">{empty.message}</p>
          {activeFolder && onCreateNew && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateNew}>
              <Plus className="h-3.5 w-3.5" />
              {addBtn?.label ?? "Add Item"}
            </Button>
          )}
          {!activeFolder && addBtn && onCreateWithType && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={() => onCreateWithType(addBtn.type)}>
              <Plus className="h-3.5 w-3.5" />
              {addBtn.label}
            </Button>
          )}
          {!activeFolder && !addBtn && onCreateNew && (
            <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateNew}>
              <Plus className="h-3.5 w-3.5" />
              Add Item
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col border-t md:gap-1.5 md:border-0">
          {visibleItems.map((item) => (
            <ItemCard
              key={item.clientId}
              item={item}
              folder={item.folderId ? folderMap.get(item.folderId) : undefined}
              onEdit={onEdit}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
              onToggleComplete={onToggleComplete}
              onUpdateContent={onUpdateContent}
            />
          ))}
          {visibleItems.length === 0 && activeFilter === "url" && (
            <div className="py-14 text-center text-sm text-muted-foreground">
              No bookmarks in {activeCategory}.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
