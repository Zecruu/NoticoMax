"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { type LocalItem, type ItemType, type LocalFolder, type RecurrenceRule } from "@/lib/db/indexed-db";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Link2, Bell, X, Eye, Pencil, List, ListOrdered, ALargeSmall, ListChecks, Trash2, ChevronDown } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";

interface ItemDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">) => void;
  onUpdate?: (clientId: string, updates: Partial<LocalItem>) => void;
  onDelete?: (clientId: string) => void;
  editingItem?: LocalItem | null;
  folders: LocalFolder[];
  defaultFolderId?: string | null;
  defaultType?: ItemType;
  defaultReminderDate?: string;
  allTags?: string[];
}

// Convert an ISO string from the DB into the value a <input type="datetime-local">
// expects ("YYYY-MM-DDTHH:MM" in LOCAL time). Without this, the input would
// show the UTC representation and shift the user's wall-clock time.
function toLocalDatetimeValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ItemDialog({ open, onClose, onSave, onUpdate, onDelete, editingItem, folders, defaultFolderId, defaultType = "note", defaultReminderDate, allTags = [] }: ItemDialogProps) {
  const [type, setType] = useState<ItemType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [recurrence, setRecurrence] = useState<RecurrenceRule>("none");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [previewing, setPreviewing] = useState(false);
  const [activeListMode, setActiveListMode] = useState<"bullet" | "numbered" | "lettered" | "checklist" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closingRef = useRef(false);

  const handleContentKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const text = ta.value;

    // Find the current line
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const line = text.slice(lineStart, start);

    // Detect list prefix on current line — check task list FIRST since "- [ ] x" also matches "- " bullet
    const taskMatch = line.match(/^(- \[[ xX]\] )(.*)/);
    const bulletMatch = line.match(/^(- )(.*)/);
    const numberedMatch = line.match(/^(\d+)\. (.*)/);
    const letteredMatch = line.match(/^([a-z])\. (.*)/);

    let nextPrefix = "";
    let isEmpty = false;

    if (taskMatch) {
      isEmpty = taskMatch[2].trim() === "";
      nextPrefix = "- [ ] ";
    } else if (numberedMatch) {
      isEmpty = numberedMatch[2].trim() === "";
      nextPrefix = `${parseInt(numberedMatch[1]) + 1}. `;
    } else if (letteredMatch) {
      isEmpty = letteredMatch[2].trim() === "";
      nextPrefix = `${String.fromCharCode(letteredMatch[1].charCodeAt(0) + 1)}. `;
    } else if (bulletMatch) {
      isEmpty = bulletMatch[2].trim() === "";
      nextPrefix = "- ";
    }

    if (!nextPrefix) return;

    e.preventDefault();

    if (isEmpty) {
      // Empty list item — remove the prefix and exit list mode
      const newContent = text.slice(0, lineStart) + text.slice(start);
      setContent(newContent);
      setActiveListMode(null);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(lineStart, lineStart);
      });
    } else {
      // Continue the list with next prefix
      const insert = "\n" + nextPrefix;
      const newContent = text.slice(0, start) + insert + text.slice(start);
      setContent(newContent);
      requestAnimationFrame(() => {
        ta.focus();
        const newPos = start + insert.length;
        ta.setSelectionRange(newPos, newPos);
      });
    }
  }, []);

  const insertListPrefix = useCallback((mode: "bullet" | "numbered" | "lettered" | "checklist") => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;

    // Find the start of the first selected line and end of the last
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = text.indexOf("\n", end);
    const blockEnd = lineEnd === -1 ? text.length : lineEnd;

    const selectedBlock = text.slice(lineStart, blockEnd);
    const lines = selectedBlock.split("\n");

    // Check if non-empty lines already have this prefix (for toggling off).
    // Checklist must be tested BEFORE bullet since "- [ ] x" also matches /^- /.
    const prefixPatterns = {
      checklist: /^- \[[ xX]\] /,
      bullet: /^- (?!\[[ xX]\] )/,
      numbered: /^\d+\. /,
      lettered: /^[a-z]\. /,
    };
    const nonEmptyLines = lines.filter((line) => line.trim() !== "");
    const allHavePrefix = nonEmptyLines.length > 0 && nonEmptyLines.every(
      (line) => prefixPatterns[mode].test(line)
    );

    let newLines: string[];
    if (allHavePrefix) {
      // Toggle off: remove prefixes
      newLines = lines.map((line) => line.replace(prefixPatterns[mode], ""));
      setActiveListMode(null);
    } else {
      // Strip any existing list prefix first, then add new one
      const stripAll = /^(?:- \[[ xX]\] |- |\d+\. |[a-z]\. )/;
      newLines = lines.map((line, i) => {
        const stripped = line.replace(stripAll, "");
        switch (mode) {
          case "checklist":
            return `- [ ] ${stripped}`;
          case "bullet":
            return `- ${stripped}`;
          case "numbered":
            return `${i + 1}. ${stripped}`;
          case "lettered":
            return `${String.fromCharCode(97 + i)}. ${stripped}`;
        }
      });
      setActiveListMode(mode);
    }

    const newBlock = newLines.join("\n");
    const newContent = text.slice(0, lineStart) + newBlock + text.slice(blockEnd);
    setContent(newContent);

    // Restore focus and cursor after React re-render
    requestAnimationFrame(() => {
      ta.focus();
      const newEnd = lineStart + newBlock.length;
      ta.setSelectionRange(newEnd, newEnd);
    });
  }, []);

  useEffect(() => {
    if (editingItem) {
      setType(editingItem.type);
      setTitle(editingItem.title);
      setContent(editingItem.content);
      setUrl(editingItem.url || "");
      setReminderDate(
        editingItem.reminderDate ? toLocalDatetimeValue(editingItem.reminderDate) : "",
      );
      setTags(editingItem.tags);
      setPinned(editingItem.pinned);
      setFolderId(editingItem.folderId || undefined);
      setRecurrence(editingItem.recurrence || "none");
    } else {
      setType(defaultType);
      setTitle("");
      setContent("");
      setUrl("");
      setReminderDate(defaultType === "reminder" && defaultReminderDate ? defaultReminderDate : "");
      setTags([]);
      setPinned(false);
      setFolderId(defaultFolderId || undefined);
      setRecurrence("none");
    }
    setPreviewing(false);
    setActiveListMode(null);
    setDetailsOpen(false);
    closingRef.current = false;
  }, [editingItem, open, defaultFolderId, defaultType, defaultReminderDate]);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !tags.includes(tag)) {
      setTags([...tags, tag]);
    }
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Auto-title from the first non-empty line of content when title is missing.
  const computeFinalTitle = (): string => {
    const t = title.trim();
    if (t) return t;
    const firstLine = content
      .split("\n")
      .map((l) => l.replace(/^(?:- \[[ xX]\] |- |\d+\. |[a-z]\. )/, "").trim())
      .find((l) => l.length > 0);
    if (firstLine) return firstLine.slice(0, 60);
    return "";
  };

  const persist = (finalTitle: string) => {
    // The datetime-local input value is in LOCAL wall-clock time with no
    // timezone (e.g. "2026-07-04T01:00"). Postgres timestamptz interprets
    // unqualified strings as UTC, which shifts the reminder by the user's
    // offset (Jul 4 1 AM EDT would become Jul 3 9 PM when re-read). Parse it
    // as local time and serialize as a true ISO with offset.
    const reminderIso =
      type === "reminder" && reminderDate
        ? new Date(reminderDate).toISOString()
        : undefined;

    const itemData = {
      type,
      title: finalTitle,
      content: content.trim(),
      url: type === "url" ? url.trim() : undefined,
      reminderDate: reminderIso,
      reminderCompleted: editingItem?.reminderCompleted || false,
      recurrence: type === "reminder" ? recurrence : undefined,
      tags,
      pinned,
      color: editingItem?.color,
      folderId: folderId || undefined,
    };

    if (editingItem && onUpdate) {
      onUpdate(editingItem.clientId, itemData);
    } else {
      onSave(itemData);
    }
  };

  // Called on every close path (explicit X, escape, outside tap). Auto-saves
  // if there's anything worth saving, otherwise silently discards. Idempotent
  // via closingRef so it never double-fires (Radix can call onOpenChange twice).
  const finalizeAndClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    const finalTitle = computeFinalTitle();
    if (finalTitle) persist(finalTitle);
    onClose();
  };

  const handleDelete = () => {
    if (!editingItem || !onDelete) return;
    if (!confirm(`Delete "${editingItem.title}"? This moves it to Trash.`)) return;
    if (closingRef.current) return;
    closingRef.current = true;
    onDelete(editingItem.clientId);
    onClose();
  };

  const toggleTaskAtIndex = useCallback((index: number) => {
    let count = 0;
    const next = content.replace(
      /^(\s*[-*+]\s+\[)([ xX])(\])/gm,
      (m, pre, mark, post) => {
        if (count++ !== index) return m;
        return pre + (mark === " " ? "x" : " ") + post;
      },
    );
    setContent(next);
  }, [content]);

  const handleTextareaInput = useCallback(() => {
    // Keep the active textarea visible above the iOS keyboard as it grows / caret moves.
    const ta = textareaRef.current;
    if (!ta) return;
    requestAnimationFrame(() => {
      try { ta.scrollIntoView({ block: "nearest" }); } catch {}
    });
  }, []);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && finalizeAndClose()}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => { e.preventDefault(); finalizeAndClose(); }}
        onPointerDownOutside={(e) => { e.preventDefault(); finalizeAndClose(); }}
        onInteractOutside={(e) => { e.preventDefault(); }}
        className="!fixed !inset-0 !top-0 !left-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-[100dvh] !max-h-none !rounded-none !border-0 !p-0 !gap-0 flex flex-col bg-background"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b shrink-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <button
            type="button"
            onClick={finalizeAndClose}
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close (auto-saves)"
            title="Close (auto-saves)"
          >
            <X className="h-5 w-5" />
          </button>
          <DialogTitle className="text-sm font-semibold truncate flex-1 text-center px-2">
            {editingItem ? "Edit Item" : "New Item"}
          </DialogTitle>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleDelete}
              disabled={!editingItem || !onDelete}
              className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Delete"
              title={editingItem ? "Delete" : "Save first to delete"}
            >
              <Trash2 className="h-5 w-5" />
            </button>
            <Button
              size="sm"
              onClick={finalizeAndClose}
              className="font-semibold h-9 px-4"
            >
              Save
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-[calc(1rem+var(--keyboard-height,0px))]">
          {!editingItem && (
            <Tabs value={type} onValueChange={(v) => setType(v as ItemType)}>
              <TabsList className="w-full">
                <TabsTrigger value="note" className="flex-1 gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Note
                </TabsTrigger>
                <TabsTrigger value="url" className="flex-1 gap-1.5">
                  <Link2 className="h-3.5 w-3.5" />
                  URL
                </TabsTrigger>
                <TabsTrigger value="reminder" className="flex-1 gap-1.5">
                  <Bell className="h-3.5 w-3.5" />
                  Reminder
                </TabsTrigger>
              </TabsList>

              <TabsContent value="note" className="hidden" />
              <TabsContent value="url" className="hidden" />
              <TabsContent value="reminder" className="hidden" />
            </Tabs>
          )}

          <Input
            id="title"
            placeholder={
              type === "note"
                ? "Note title (optional — first line of content used otherwise)"
                : type === "url"
                  ? "Bookmark name..."
                  : "Reminder title..."
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
            className="text-lg font-semibold border-0 px-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/50"
          />

          {/* Folder picker — always visible. Choosing a family-shared folder
              auto-shares the item with that household via inheritance. */}
          {folders.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="folder-select" className="text-xs text-muted-foreground shrink-0">
                Save to
              </Label>
              <Select
                value={folderId || "none"}
                onValueChange={(v) => setFolderId(v === "none" ? undefined : v)}
              >
                <SelectTrigger id="folder-select" className="h-8 flex-1">
                  <SelectValue placeholder="No folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No folder</span>
                  </SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.clientId} value={folder.clientId}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: folder.color || "#6b7280" }}
                        />
                        <span>{folder.name}</span>
                        {folder.householdId && (
                          <span className="text-[9px] rounded-full bg-primary/15 text-primary px-1 py-0.5 font-semibold uppercase tracking-wider">
                            Family
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {type === "url" && (
            <div className="space-y-2">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          )}

          {type === "reminder" && (
            <>
            <div className="space-y-2">
              <Label htmlFor="reminderDate">Date & Time</Label>
              <Input
                id="reminderDate"
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recurrence">Repeat</Label>
              <select
                id="recurrence"
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value as RecurrenceRule)}
                className="text-foreground bg-transparent dark:bg-input/30 border-input flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
              >
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly (birthdays, anniversaries)</option>
              </select>
            </div>
            </>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="content">
                {type === "note" ? "Content" : "Description (optional)"}
              </Label>
              {type === "note" && content && (
                <div className="flex items-center gap-1 rounded-md border p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewing(false)}
                    className={`flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs transition-colors ${
                      !previewing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewing(true)}
                    className={`flex items-center gap-1 rounded-sm px-2 py-0.5 text-xs transition-colors ${
                      previewing ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>
                </div>
              )}
            </div>
            {type === "note" && !previewing && (
              <div className="flex items-center gap-0.5 rounded-md border p-0.5 w-fit">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertListPrefix("checklist")}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                    activeListMode === "checklist" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title="Checklist (tap circles to tick)"
                >
                  <ListChecks className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertListPrefix("bullet")}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                    activeListMode === "bullet" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title="Bullet list"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertListPrefix("numbered")}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                    activeListMode === "numbered" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title="Numbered list"
                >
                  <ListOrdered className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertListPrefix("lettered")}
                  className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                    activeListMode === "lettered" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                  title="Lettered list (a, b, c)"
                >
                  <ALargeSmall className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            {previewing && type === "note" ? (
              <div className="min-h-[150px] max-h-[60dvh] overflow-auto rounded-md border bg-background p-3">
                <MarkdownRenderer content={content} onToggleTask={toggleTaskAtIndex} />
              </div>
            ) : (
              <Textarea
                ref={type === "note" ? textareaRef : undefined}
                id="content"
                placeholder={
                  type === "note"
                    ? "Write your note... (supports markdown)"
                    : "Add a description..."
                }
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onInput={type === "note" ? handleTextareaInput : undefined}
                onFocus={type === "note" ? handleTextareaInput : undefined}
                onKeyDown={type === "note" ? handleContentKeyDown : undefined}
                rows={type === "note" ? 6 : 3}
              />
            )}
          </div>

          {/* Collapsible Details: folder + tags */}
          <div className="rounded-md border">
            <button
              type="button"
              onClick={() => setDetailsOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={detailsOpen}
            >
              <span className="flex items-center gap-2">
                Details
                {(folderId || tags.length > 0) && (
                  <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5">
                    {[folderId ? "folder" : null, tags.length > 0 ? `${tags.length} tag${tags.length > 1 ? "s" : ""}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", detailsOpen && "rotate-180")} />
            </button>
            {detailsOpen && (
              <div className="border-t px-3 py-3 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Tags</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add tag..."
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag();
                        }
                      }}
                    />
                    <Button type="button" variant="secondary" onClick={handleAddTag}>
                      Add
                    </Button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1">
                          {tag}
                          <button
                            onClick={() => handleRemoveTag(tag)}
                            className="ml-0.5 hover:text-destructive"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                  {allTags.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] text-muted-foreground">Suggestions</p>
                      <div className="flex flex-wrap gap-1">
                        {allTags
                          .filter((t) => !tags.includes(t) && (!tagInput || t.toLowerCase().includes(tagInput.toLowerCase())))
                          .slice(0, 8)
                          .map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                if (!tags.includes(tag)) setTags([...tags, tag]);
                                setTagInput("");
                              }}
                              className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                            >
                              + {tag}
                            </button>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
