"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { type LocalFolder } from "@/lib/db/indexed-db";
import {
  FileText,
  Link2,
  Bell,
  LayoutDashboard,
  Plus,
  Settings,
  MoreHorizontal,
  Pencil,
  Palette,
  Trash2,
  LogIn,
  Crown,
  Tag,
  Calendar,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Link from "next/link";
import { toast } from "sonner";
import { type UserTier } from "@/hooks/use-subscription";
import { type Session } from "next-auth";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#78716c",
];

const navItems = [
  { label: "All Items", value: "all", icon: LayoutDashboard },
  { label: "Notes", value: "note", icon: FileText },
  { label: "URLs", value: "url", icon: Link2 },
  { label: "Reminders", value: "reminder", icon: Bell },
];

interface SidebarProps {
  activeFilter: string;
  activeFolder: string | null;
  onFilterChange: (filter: string) => void;
  onFolderChange: (folderId: string | null) => void;
  onCreateNew: () => void;
  itemCounts: Record<string, number>;
  folders: LocalFolder[];
  folderItemCounts: Record<string, number>;
  onAddFolder: (folder: { name: string; color: string }) => Promise<void>;
  onEditFolder: (clientId: string, updates: Partial<LocalFolder>) => Promise<void>;
  onRemoveFolder: (clientId: string) => Promise<void>;
  tier: UserTier;
  session: Session | null | undefined;
  activeView?: string;
  onViewChange?: (view: string) => void;
  trashCount?: number;
  allTags?: string[];
  activeTag?: string | null;
  onTagChange?: (tag: string | null) => void;
}

export function Sidebar({
  activeFilter,
  activeFolder,
  onFilterChange,
  onFolderChange,
  onCreateNew,
  itemCounts,
  folders,
  folderItemCounts,
  onAddFolder,
  onEditFolder,
  onRemoveFolder,
  tier,
  session,
  activeView,
  onViewChange,
  trashCount = 0,
  allTags = [],
  activeTag,
  onTagChange,
}: SidebarProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletingFolder, setDeletingFolder] = useState<LocalFolder | null>(null);

  const createInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) createInputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      return;
    }
    const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
    await onAddFolder({ name, color });
    setNewName("");
    setCreating(false);
    toast.success("Folder created");
  };

  const handleRename = async (clientId: string) => {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    await onEditFolder(clientId, { name });
    setRenamingId(null);
    toast.success("Folder renamed");
  };

  const handleColorChange = async (clientId: string, color: string) => {
    await onEditFolder(clientId, { color });
    toast.success("Color updated");
  };

  const handleDelete = async () => {
    if (!deletingFolder) return;
    await onRemoveFolder(deletingFolder.clientId);
    if (activeFolder === deletingFolder.clientId) {
      onFolderChange(null);
    }
    setDeletingFolder(null);
    toast.success("Folder and all its items deleted");
  };

  return (
    <aside className="hidden md:flex w-56 flex-col border-r bg-muted/30">
      <div className="flex-1 overflow-auto p-4">
        <Button onClick={onCreateNew} className="mb-6 w-full gap-2">
          <Plus className="h-4 w-4" />
          New Item
        </Button>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const count =
              item.value === "all"
                ? Object.values(itemCounts).reduce((a, b) => a + b, 0)
                : itemCounts[item.value] || 0;

            return (
              <button
                key={item.value}
                onClick={() => {
                  onFolderChange(null);
                  onFilterChange(item.value);
                  onViewChange?.("list");
                  onTagChange?.(null);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  activeView !== "trash" && activeView !== "calendar" && activeView !== "study" && !activeFolder && !activeTag && activeFilter === item.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1 text-left">{item.label}</span>
                <span
                  className={cn(
                    "text-xs tabular-nums",
                    activeView !== "trash" && activeView !== "calendar" && activeView !== "study" && !activeFolder && !activeTag && activeFilter === item.value
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => {
              onFolderChange(null);
              onViewChange?.("study");
              onTagChange?.(null);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              activeView === "study"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <BookOpen className="h-4 w-4" />
            <span className="flex-1 text-left">Study</span>
          </button>

          <button
            onClick={() => {
              onFolderChange(null);
              onViewChange?.("calendar");
              onTagChange?.(null);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              activeView === "calendar"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Calendar className="h-4 w-4" />
            <span className="flex-1 text-left">Calendar</span>
          </button>

          <button
            onClick={() => {
              onFolderChange(null);
              onViewChange?.("trash");
              onTagChange?.(null);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              activeView === "trash"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Trash2 className="h-4 w-4" />
            <span className="flex-1 text-left">Trash</span>
            {trashCount > 0 && (
              <span className={cn(
                "text-xs tabular-nums",
                activeView === "trash" ? "text-primary-foreground/70" : "text-muted-foreground"
              )}>
                {trashCount}
              </span>
            )}
          </button>
        </nav>

        <Separator className="my-4" />

        <div className="flex items-center justify-between px-3 mb-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Folders
          </p>
          <button
            onClick={() => setCreating(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <nav className="space-y-1">
          {creating && (
            <div className="px-3 py-1">
              <Input
                ref={createInputRef}
                placeholder="Folder name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") {
                    setCreating(false);
                    setNewName("");
                  }
                }}
                onBlur={handleCreate}
                className="h-8 text-sm"
              />
            </div>
          )}

          {folders.map((folder) => (
            <div
              key={folder.clientId}
              className={cn(
                "group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors cursor-pointer",
                activeFolder === folder.clientId
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              onClick={() => {
                if (renamingId !== folder.clientId) {
                  onFolderChange(folder.clientId);
                  onFilterChange("all");
                  onViewChange?.("list");
                  onTagChange?.(null);
                }
              }}
            >
              <div
                className="h-3 w-3 rounded-sm shrink-0"
                style={{ backgroundColor: folder.color || "#6b7280" }}
              />

              {renamingId === folder.clientId ? (
                <Input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(folder.clientId);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  onBlur={() => handleRename(folder.clientId)}
                  onClick={(e) => e.stopPropagation()}
                  className="h-6 flex-1 text-sm px-1 py-0 border-none bg-transparent focus-visible:ring-1"
                />
              ) : (
                <span className="flex-1 text-left truncate">{folder.name}</span>
              )}

              {renamingId !== folder.clientId && (
                <>
                  <span
                    className={cn(
                      "text-xs tabular-nums group-hover:hidden",
                      activeFolder === folder.clientId
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    )}
                  >
                    {folderItemCounts[folder.clientId] || 0}
                  </span>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      asChild
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className={cn(
                          "hidden group-hover:flex h-5 w-5 items-center justify-center rounded-sm transition-colors",
                          activeFolder === folder.clientId
                            ? "hover:bg-primary-foreground/20"
                            : "hover:bg-muted-foreground/20"
                        )}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" side="right">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenamingId(folder.clientId);
                          setRenameValue(folder.name);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <Palette className="h-3.5 w-3.5 mr-2" />
                          Color
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <div className="grid grid-cols-5 gap-1.5 p-2">
                            {PRESET_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleColorChange(folder.clientId, color);
                                }}
                                className="h-6 w-6 rounded-md border-2 transition-transform hover:scale-110"
                                style={{
                                  backgroundColor: color,
                                  borderColor:
                                    folder.color === color ? "white" : "transparent",
                                  boxShadow:
                                    folder.color === color
                                      ? `0 0 0 2px ${color}`
                                      : "none",
                                }}
                              />
                            ))}
                          </div>
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingFolder(folder);
                        }}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          ))}

          {folders.length === 0 && !creating && (
            <p className="px-3 py-2 text-xs text-muted-foreground/60">
              Click + to create a folder
            </p>
          )}
        </nav>

        {allTags.length > 0 && (
          <>
            <Separator className="my-4" />
            <p className="px-3 mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tags
            </p>
            <div className="flex flex-wrap gap-1 px-3">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    onTagChange?.(activeTag === tag ? null : tag);
                    onFolderChange(null);
                    onViewChange?.("list");
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
                    activeTag === tag
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  {tag}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t p-3 space-y-1">
        {session ? (
          <Link
            href="/settings"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt=""
                className="h-5 w-5 rounded-full"
              />
            ) : (
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-medium">
                {(session.user.name || "U")[0].toUpperCase()}
              </div>
            )}
            <span className="flex-1 truncate">{session.user.name || session.user.email}</span>
            {tier === "pro" && <Crown className="h-3 w-3 text-primary" />}
          </Link>
        ) : (
          <Link
            href="/auth/sign-in"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogIn className="h-4 w-4" />
            Sign in
          </Link>
        )}
        <Link
          href="/settings"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingFolder}
        onOpenChange={(open) => !open && setDeletingFolder(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Folder</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{deletingFolder?.name}&quot;?
              This will also permanently delete all notes, URLs, and reminders
              inside this folder. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeletingFolder(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete Folder & Contents
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
