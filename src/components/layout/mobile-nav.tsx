"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { type LocalFolder } from "@/lib/db/indexed-db";
import {
  FileText,
  Link2,
  Plus,
  LayoutDashboard,
  FolderOpen,
  MoreHorizontal,
  Pencil,
  Palette,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { toast } from "sonner";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899",
  "#6b7280", "#78716c",
];

const navItems = [
  { label: "All", value: "all", icon: LayoutDashboard },
  { label: "Notes", value: "note", icon: FileText },
  { label: "New", value: "new", icon: Plus },
  { label: "URLs", value: "url", icon: Link2 },
  { label: "Folders", value: "folders", icon: FolderOpen },
];

interface MobileNavProps {
  activeFilter: string;
  activeFolder: string | null;
  onFilterChange: (filter: string) => void;
  onFolderChange: (folderId: string | null) => void;
  onCreateNew: () => void;
  folders: LocalFolder[];
  folderItemCounts: Record<string, number>;
  onAddFolder: (folder: { name: string; color: string }) => Promise<void>;
  onEditFolder: (clientId: string, updates: Partial<LocalFolder>) => Promise<void>;
  onRemoveFolder: (clientId: string) => Promise<void>;
}

export function MobileNav({
  activeFilter,
  activeFolder,
  onFilterChange,
  onFolderChange,
  onCreateNew,
  folders,
  folderItemCounts,
  onAddFolder,
  onEditFolder,
  onRemoveFolder,
}: MobileNavProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
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
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex md:hidden border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isNew = item.value === "new";
          const isFolders = item.value === "folders";

          return (
            <button
              key={item.value}
              onClick={() => {
                if (isNew) {
                  onCreateNew();
                } else if (isFolders) {
                  setSheetOpen(true);
                } else {
                  onFolderChange(null);
                  onFilterChange(item.value);
                }
              }}
              className={cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] transition-colors",
                isNew
                  ? "text-primary"
                  : isFolders && activeFolder
                    ? "text-primary"
                    : !isFolders && !activeFolder && activeFilter === item.value
                      ? "text-primary"
                      : "text-muted-foreground"
              )}
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full",
                  isNew && "bg-primary text-primary-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Folders Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[70vh] rounded-t-xl">
          <SheetHeader className="flex flex-row items-center justify-between">
            <SheetTitle>Folders</SheetTitle>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCreating(true)}
              className="gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              New
            </Button>
          </SheetHeader>

          <div className="overflow-auto px-4 pb-4 space-y-1">
            {/* All Items option to deselect folder */}
            <button
              onClick={() => {
                onFolderChange(null);
                onFilterChange("all");
                setSheetOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                !activeFolder
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span className="flex-1 text-left">All Items</span>
            </button>

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
                  className="h-9 text-sm"
                />
              </div>
            )}

            {folders.map((folder) => (
              <div
                key={folder.clientId}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors cursor-pointer",
                  activeFolder === folder.clientId
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                onClick={() => {
                  if (renamingId !== folder.clientId) {
                    onFolderChange(folder.clientId);
                    onFilterChange("all");
                    setSheetOpen(false);
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
                    className="h-7 flex-1 text-sm px-1 py-0 border-none bg-transparent focus-visible:ring-1"
                  />
                ) : (
                  <span className="flex-1 text-left truncate">{folder.name}</span>
                )}

                {renamingId !== folder.clientId && (
                  <>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
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
                        <button className="flex h-6 w-6 items-center justify-center rounded-sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">No folders yet</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

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
    </>
  );
}
