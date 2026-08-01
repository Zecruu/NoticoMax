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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft, X, Eye, Pencil, List, ListOrdered, ALargeSmall, ListChecks, Trash2, ChevronDown, MoreHorizontal, Share2 } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";
import {
  DEFAULT_URL_CATEGORIES,
  getUrlCategoryLabel,
  withUrlCategory,
  withoutUrlCategoryTags,
} from "@/lib/url-categories";

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
  const [urlCategory, setUrlCategory] = useState("General");
  const [customCategoryOpen, setCustomCategoryOpen] = useState(false);
  const [customCategory, setCustomCategory] = useState("");
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
      setTags(withoutUrlCategoryTags(editingItem.tags));
      setUrlCategory(getUrlCategoryLabel(editingItem.tags));
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
      setUrlCategory("General");
      setPinned(false);
      setFolderId(defaultFolderId || undefined);
      setRecurrence("none");
    }
    setPreviewing(false);
    setActiveListMode(null);
    setDetailsOpen(false);
    setCustomCategoryOpen(false);
    setCustomCategory("");
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
      tags: type === "url" ? withUrlCategory(tags, urlCategory) : tags,
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

  const handleShare = async () => {
    if (!editingItem) return;
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: editingItem.clientId }),
      });
      if (!res.ok) throw new Error();
      const { shareId } = await res.json();
      await navigator.clipboard.writeText(`${window.location.origin}/shared/${shareId}`);
      toast.success("Share link copied");
      setDetailsOpen(false);
    } catch {
      toast.error("Failed to create share link");
    }
  };

  const applyCustomCategory = () => {
    const value = customCategory.trim();
    if (!value) return;
    setUrlCategory(value.slice(0, 40));
    setCustomCategory("");
    setCustomCategoryOpen(false);
  };

  const detailsContent = (
    <div className="space-y-5">
      {type === "note" && content && (
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={() => {
            setPreviewing((value) => !value);
            setDetailsOpen(false);
          }}
        >
          {previewing ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {previewing ? "Return to editing" : "Preview Markdown"}
        </Button>
      )}

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label htmlFor="item-pinned">Pinned</Label>
          <p className="text-xs text-muted-foreground">Keep this item at the top of its list.</p>
        </div>
        <Switch id="item-pinned" checked={pinned} onCheckedChange={setPinned} />
      </div>

      {folders.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="folder-select">Folder</Label>
          <Select
            value={folderId || "none"}
            onValueChange={(value) => setFolderId(value === "none" ? undefined : value)}
          >
            <SelectTrigger id="folder-select">
              <SelectValue placeholder="No folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">No folder</span>
              </SelectItem>
              {folders.map((folder) => (
                <SelectItem key={folder.clientId} value={folder.clientId}>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: folder.color || "#6b7280" }}
                    />
                    <span>{folder.name}</span>
                    {folder.householdId && (
                      <span className="rounded-full bg-primary/15 px-1 py-0.5 text-[9px] font-semibold uppercase text-primary">
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

      <div className="space-y-2">
        <Label htmlFor="item-tag-input">Tags</Label>
        <div className="flex gap-2">
          <Input
            id="item-tag-input"
            placeholder="Add tag..."
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddTag();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={handleAddTag}>Add</Button>
        </div>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="gap-1">
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="ml-0.5 hover:text-destructive"
                  aria-label={`Remove ${tag} tag`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </Badge>
            ))}
          </div>
        )}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {allTags
              .filter((tag) => !tags.includes(tag) && (!tagInput || tag.toLowerCase().includes(tagInput.toLowerCase())))
              .slice(0, 8)
              .map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setTags((current) => current.includes(tag) ? current : [...current, tag]);
                    setTagInput("");
                  }}
                  className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  + {tag}
                </button>
              ))}
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        {editingItem && (
          <Button type="button" variant="outline" className="w-full justify-start" onClick={handleShare}>
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        )}
        {editingItem && onDelete && (
          <Button type="button" variant="ghost" className="w-full justify-start text-destructive hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
            Move to Trash
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && finalizeAndClose()}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onEscapeKeyDown={(e) => { e.preventDefault(); finalizeAndClose(); }}
        onPointerDownOutside={(e) => { e.preventDefault(); finalizeAndClose(); }}
        onInteractOutside={(e) => { e.preventDefault(); }}
        className="item-editor-shell !fixed !inset-0 !left-0 !top-0 !flex !h-[var(--visual-viewport-height,100dvh)] !max-h-none !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col !gap-0 !overflow-hidden !rounded-none !border-0 !p-0 bg-background md:!inset-auto md:!left-1/2 md:!top-1/2 md:!h-[min(760px,calc(100dvh-3rem))] md:!w-[min(720px,calc(100vw-3rem))] md:!-translate-x-1/2 md:!-translate-y-1/2 md:!rounded-lg md:!border"
      >
        <DialogTitle className="sr-only">
          {editingItem ? `Edit ${type}` : `New ${type}`}
        </DialogTitle>

        <div className="item-editor-topbar flex shrink-0 items-center justify-between gap-2 border-b bg-background/95 px-3 pb-2.5 pt-[max(0.625rem,var(--safe-area-top))] backdrop-blur md:pt-2.5">
          <button
            type="button"
            onClick={finalizeAndClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
            aria-label="Back and save"
            title="Back and save"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <span className="truncate px-2 text-sm font-medium text-muted-foreground">
            {type === "note" ? "Note" : type === "url" ? "Bookmark" : "Reminder"}
          </span>
          <div className="flex items-center gap-1">
            {type === "note" && previewing && (
              <button
                type="button"
                onClick={() => setPreviewing(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Return to editing"
                title="Return to editing"
              >
                <Pencil className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
              aria-label="Item details"
              title="Item details"
            >
              <MoreHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>

        {type === "note" ? (
          <div className="flex min-h-0 flex-1 flex-col">
            {previewing ? (
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 md:px-8">
                <MarkdownRenderer content={content} onToggleTask={toggleTaskAtIndex} />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col px-5 pt-4 md:px-8 md:pt-6">
                <Input
                  id="title"
                  placeholder="Title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-auto shrink-0 border-0 !bg-transparent px-0 py-1 text-2xl font-semibold shadow-none placeholder:text-muted-foreground/35 focus-visible:ring-0 md:text-3xl"
                />
                <Textarea
                  ref={textareaRef}
                  id="content"
                  autoFocus={!editingItem}
                  placeholder="Start typing..."
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onInput={handleTextareaInput}
                  onFocus={handleTextareaInput}
                  onKeyDown={handleContentKeyDown}
                  className="min-h-0 flex-1 resize-none overflow-y-auto border-0 !bg-transparent px-0 py-3 text-base leading-7 shadow-none placeholder:text-muted-foreground/35 focus-visible:ring-0 md:text-base"
                  style={{ fieldSizing: "fixed" }}
                />
              </div>
            )}

            {!previewing && (
              <div className="item-editor-toolbar flex shrink-0 items-center justify-center border-t bg-background/95 px-3 pt-2 backdrop-blur md:justify-start md:px-6">
                <div className="flex h-10 items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
                  {([
                    ["checklist", ListChecks, "Checklist"],
                    ["bullet", List, "Bullet list"],
                    ["numbered", ListOrdered, "Numbered list"],
                    ["lettered", ALargeSmall, "Lettered list"],
                  ] as const).map(([mode, Icon, label]) => (
                    <button
                      key={mode}
                      type="button"
                      onPointerDown={(event) => event.preventDefault()}
                      onClick={() => insertListPrefix(mode)}
                      className={cn(
                        "inline-flex h-8 w-10 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                        activeListMode === mode && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                      )}
                      aria-label={label}
                      title={label}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 pb-[max(1.25rem,var(--safe-area-bottom))] md:px-8 md:py-6">
            <div className="mx-auto max-w-xl space-y-5">
            <Input
              id="title"
              placeholder={type === "url" ? "Bookmark name..." : "Reminder title..."}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              autoFocus={!editingItem}
              className="text-lg font-semibold border-0 px-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/40"
            />

            {type === "url" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="url">URL</Label>
                  <Input
                    id="url"
                    type="url"
                    inputMode="url"
                    placeholder="https://..."
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Category</Label>
                  <div className="flex flex-wrap gap-2">
                    {DEFAULT_URL_CATEGORIES.map((category) => (
                      <button
                        key={category}
                        type="button"
                        onClick={() => {
                          setUrlCategory(category);
                          setCustomCategoryOpen(false);
                        }}
                        className={cn(
                          "h-8 rounded-md border px-3 text-xs font-medium transition-colors",
                          urlCategory === category
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {category}
                      </button>
                    ))}
                    {!DEFAULT_URL_CATEGORIES.includes(urlCategory as typeof DEFAULT_URL_CATEGORIES[number]) && (
                      <button type="button" className="h-8 rounded-md border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground">
                        {urlCategory}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setCustomCategoryOpen((value) => !value)}
                      className="h-8 rounded-md border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      Custom
                    </button>
                  </div>
                  {customCategoryOpen && (
                    <div className="flex gap-2">
                      <Input
                        value={customCategory}
                        onChange={(event) => setCustomCategory(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            applyCustomCategory();
                          }
                        }}
                        placeholder="Category name"
                        maxLength={40}
                        autoFocus
                      />
                      <Button type="button" variant="secondary" onClick={applyCustomCategory}>Set</Button>
                    </div>
                  )}
                </div>
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
                    onChange={(event) => setReminderDate(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurrence">Repeat</Label>
                  <select
                    id="recurrence"
                    value={recurrence}
                    onChange={(event) => setRecurrence(event.target.value as RecurrenceRule)}
                    className="border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
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
              <Label htmlFor="content">Description (optional)</Label>
              <Textarea
                id="content"
                placeholder="Add a description..."
                value={content}
                onChange={(event) => setContent(event.target.value)}
                rows={4}
              />
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Details
              <ChevronDown className="h-4 w-4 -rotate-90" />
            </button>
          </div>
          </div>
        )}

        {detailsOpen && (
          <div className="absolute inset-0 z-20 flex items-end md:items-stretch md:justify-end">
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              onClick={() => setDetailsOpen(false)}
              aria-label="Close item details"
            />
            <section className="item-editor-details relative z-10 flex max-h-[85%] w-full flex-col overflow-hidden rounded-t-lg border-t bg-background shadow-xl md:h-full md:max-h-none md:w-[22rem] md:rounded-none md:rounded-r-lg md:border-l md:border-t-0">
              <div className="flex shrink-0 items-center justify-between border-b px-4 py-3">
                <h2 className="font-semibold">Details</h2>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(false)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Close details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {detailsContent}
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
