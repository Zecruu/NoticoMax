"use client";

import { Fragment } from "react";
import type { LocalItem, LocalFolder } from "@/lib/db/indexed-db";
import { ItemCard } from "./item-card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileText, Link2, Bell, Plus, Search } from "lucide-react";

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
  searchQuery?: string;
  activeTag?: string | null;
  onClearSearch?: () => void;
  onCreateWithType?: (type: "note" | "url" | "reminder") => void;
  onCreateNew?: () => void;
}

const types = {
  note: {
    heading: "Notes",
    action: "New note",
    empty: "No notes yet",
    hint: "Write a thought, make a plan, or start a checklist.",
    icon: FileText,
  },
  url: {
    heading: "Links",
    action: "Save a link",
    empty: "No links yet",
    hint: "Paste an address to keep it here. Add a title or a note if you like.",
    icon: Link2,
  },
  reminder: {
    heading: "Reminders",
    action: "New reminder",
    empty: "No reminders yet",
    hint: "Keep a task here and choose when you want a reminder.",
    icon: Bell,
  },
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
  searchQuery = "",
  activeTag,
  onClearSearch,
  onCreateWithType,
  onCreateNew,
}: ItemListProps) {
  const folderMap = new Map(folders.map((folder) => [folder.clientId, folder]));
  const config = types[activeFilter as keyof typeof types];
  const searching = !!searchQuery.trim();
  const heading = searching
    ? "Search results"
    : activeFolder
    ? folderMap.get(activeFolder)?.name || "Folder"
    : activeTag
    ? `#${activeTag}`
    : config?.heading || "Your library";
  const hasPinned = items.some((item) => item.pinned);
  const Icon = searching ? Search : config?.icon || FileText;
  const canCreate = onCreateWithType || onCreateNew;

  return (
    <section
      className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-8 sm:py-8"
      aria-label={heading}
    >
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            {heading}
          </h1>
          <p
            className="mt-1 text-sm leading-6 text-muted-foreground"
            aria-live="polite"
          >
            {loading
              ? "Loading your library…"
              : searching
              ? `${items.length} result${
                  items.length === 1 ? "" : "s"
                } for “${searchQuery.trim()}”`
              : `${items.length} ${
                  items.length === 1 ? "item" : "items"
                } · Recently edited`}
          </p>
        </div>
        {canCreate &&
          (config && onCreateWithType ? (
            <Button
              className="min-h-11 shrink-0 gap-2"
              onClick={() =>
                onCreateWithType(activeFilter as keyof typeof types)
              }
            >
              <Plus className="size-4" />
              {config.action}
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="min-h-11 shrink-0 gap-2">
                  <Plus className="size-4" />
                  New
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="[&_[role=menuitem]]:min-h-11"
              >
                {Object.entries(types).map(([type, entry]) => (
                  <DropdownMenuItem
                    key={type}
                    onClick={() =>
                      onCreateWithType
                        ? onCreateWithType(type as keyof typeof types)
                        : onCreateNew?.()
                    }
                  >
                    <entry.icon />
                    {entry.action}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
      </div>
      {loading ? (
        <div className="space-y-1" role="status" aria-label="Loading notes">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="space-y-3 border-b border-border/60 py-5 motion-safe:animate-pulse"
            >
              <div className="h-5 w-2/3 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : !items.length ? (
        <div className="py-16 text-center sm:py-24">
          <Icon
            className="mx-auto mb-5 size-7 text-muted-foreground"
            aria-hidden="true"
          />
          <h2 className="text-lg font-medium">
            {searching
              ? "Nothing found"
              : activeTag
              ? "No items with this tag"
              : activeFolder
              ? "This folder is empty"
              : config?.empty || "Your library is ready"}
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
            {searching
              ? "Try a different word, a website, or a tag."
              : activeFolder
              ? "New notes and links you add here will stay in this folder."
              : config?.hint ||
                "Keep your notes, links, and reminders together. Start with something you want to remember."}
          </p>
          {searching && onClearSearch && (
            <Button
              variant="outline"
              className="mt-5 min-h-11"
              onClick={onClearSearch}
            >
              Clear search
            </Button>
          )}
        </div>
      ) : (
        <div>
          {items.map((item, index) => (
            <Fragment key={item.clientId}>
              {hasPinned &&
                (index === 0 || items[index - 1].pinned !== item.pinned) && (
                  <h2
                    className={`${
                      index ? "mt-6" : ""
                    } mb-2 px-2 text-sm font-medium text-muted-foreground`}
                  >
                    {item.pinned ? "Pinned" : "Recent"}
                  </h2>
                )}
              <ItemCard
                item={item}
                folder={
                  item.folderId ? folderMap.get(item.folderId) : undefined
                }
                onEdit={onEdit}
                onDelete={onDelete}
                onTogglePin={onTogglePin}
                onToggleComplete={onToggleComplete}
                onUpdateContent={onUpdateContent}
              />
            </Fragment>
          ))}
        </div>
      )}
    </section>
  );
}
