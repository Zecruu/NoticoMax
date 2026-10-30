"use client";

import { useState, useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import {
  type LocalItem,
  type ItemType,
  type LocalFolder,
  type RecurrenceRule,
} from "@/lib/db/indexed-db";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Link2,
  Bell,
  X,
  Eye,
  Pencil,
  List,
  ListOrdered,
  ALargeSmall,
  ListChecks,
  Trash2,
  ChevronDown,
  ChevronLeft,
  MoreHorizontal,
  Pin,
  PinOff,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ReminderSchedule } from "./reminder-schedule";
import {
  hasItemChanges,
  prepareItemDraft,
  toggleChecklistTask,
} from "@/lib/items/draft";

const MarkdownPreview = dynamic(
  () =>
    import("@/components/markdown-renderer").then(
      (module) => module.MarkdownRenderer
    ),
  {
    loading: () => (
      <p className="text-sm text-muted-foreground" role="status">
        Loading preview…
      </p>
    ),
  }
);

interface ItemDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (
    item: Omit<
      LocalItem,
      "id" | "clientId" | "createdAt" | "updatedAt" | "deleted"
    >
  ) => void | Promise<void>;
  onUpdate?: (
    clientId: string,
    updates: Partial<LocalItem>
  ) => void | Promise<void>;
  onDelete?: (clientId: string) => void | Promise<void>;
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
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function ItemDialog({
  open,
  onClose,
  onSave,
  onUpdate,
  onDelete,
  editingItem,
  folders,
  defaultFolderId,
  defaultType = "note",
  defaultReminderDate,
  allTags = [],
}: ItemDialogProps) {
  // The parent mounts one editor per draft. Initialize once so prop refreshes
  // (for example a background sync) cannot replace text the user is typing.
  const [type, setType] = useState<ItemType>(editingItem?.type ?? defaultType);
  const [title, setTitle] = useState(editingItem?.title ?? "");
  const [content, setContent] = useState(editingItem?.content ?? "");
  const [url, setUrl] = useState(editingItem?.url ?? "");
  const [reminderDate, setReminderDate] = useState(
    editingItem?.reminderDate
      ? toLocalDatetimeValue(editingItem.reminderDate)
      : defaultType === "reminder"
      ? defaultReminderDate ?? ""
      : ""
  );
  const [recurrence, setRecurrence] = useState<RecurrenceRule>(
    editingItem?.recurrence ?? "none"
  );
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(editingItem?.tags ?? []);
  const [pinned, setPinned] = useState(editingItem?.pinned ?? false);
  const [folderId, setFolderId] = useState<string | undefined>(
    editingItem?.folderId ?? defaultFolderId ?? undefined
  );
  const [previewing, setPreviewing] = useState(false);
  const [activeListMode, setActiveListMode] = useState<
    "bullet" | "numbered" | "lettered" | "checklist" | null
  >(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const closingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<{
    field?: string;
    message: string;
  } | null>(null);

  const handleContentKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter" || e.nativeEvent.isComposing || e.shiftKey) return;

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
        nextPrefix = `${String.fromCharCode(
          letteredMatch[1].charCodeAt(0) + 1
        )}. `;
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
    },
    []
  );

  const insertListPrefix = useCallback(
    (mode: "bullet" | "numbered" | "lettered" | "checklist") => {
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
      const allHavePrefix =
        nonEmptyLines.length > 0 &&
        nonEmptyLines.every((line) => prefixPatterns[mode].test(line));

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
      const newContent =
        text.slice(0, lineStart) + newBlock + text.slice(blockEnd);
      setContent(newContent);

      // Restore focus and cursor after React re-render
      requestAnimationFrame(() => {
        ta.focus();
        const newEnd = lineStart + newBlock.length;
        ta.setSelectionRange(newEnd, newEnd);
      });
    },
    []
  );

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

  const finalizeAndClose = async () => {
    if (closingRef.current) return;
    const draft = prepareItemDraft(
      {
        type,
        title,
        content,
        url,
        reminderDate,
        recurrence,
        tags: tagInput.trim() ? [...tags, tagInput] : tags,
        pinned,
        folderId,
      },
      editingItem
    );
    if (draft.kind === "invalid") {
      setError(draft);
      document.getElementById(draft.field)?.focus();
      return;
    }
    if (draft.kind === "empty") {
      onClose();
      return;
    }
    if (editingItem && !hasItemChanges(draft.item, editingItem)) {
      onClose();
      return;
    }
    closingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      if (editingItem) {
        if (!onUpdate) throw new Error("Updates are unavailable");
        await onUpdate(editingItem.clientId, draft.item);
      } else {
        await onSave(draft.item);
      }
      onClose();
    } catch {
      closingRef.current = false;
      setSaving(false);
      setError({
        message: "Couldn't save. Your draft is still here. Try saving again.",
      });
    }
  };

  const handleDelete = async () => {
    if (!editingItem || !onDelete || closingRef.current) return;
    if (!confirm(`Move "${editingItem.title}" to trash?`)) return;
    closingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onDelete(editingItem.clientId);
      onClose();
    } catch {
      closingRef.current = false;
      setSaving(false);
      setError({
        message: "Couldn't move this to trash. Your note is still here.",
      });
    }
  };

  const discardChanges = () => {
    if (closingRef.current) return;
    if (confirm(editingItem ? "Discard your changes?" : "Discard this draft?"))
      onClose();
  };

  const toggleTaskAtIndex = (index: number) =>
    setContent((previous) => toggleChecklistTask(previous, index));

  const handleTextareaInput = useCallback(() => {
    // Keep the active textarea visible above the iOS keyboard as it grows / caret moves.
    const ta = textareaRef.current;
    if (!ta) return;
    requestAnimationFrame(() => {
      try {
        ta.scrollIntoView({ block: "nearest" });
      } catch {}
    });
  }, []);

  const kind =
    type === "url" ? "link" : type === "reminder" ? "reminder" : "note";
  const folder = folders.find((entry) => entry.clientId === folderId);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) void finalizeAndClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          document
            .getElementById(
              type === "note" ? "content" : type === "url" ? "url" : "title"
            )
            ?.focus();
        }}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          void finalizeAndClose();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          void finalizeAndClose();
        }}
        onInteractOutside={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (
            !event.nativeEvent.isComposing &&
            (event.metaKey || event.ctrlKey) &&
            (event.key === "s" || event.key === "Enter")
          ) {
            event.preventDefault();
            void finalizeAndClose();
          }
        }}
        className="!fixed !inset-x-0 !bottom-auto !top-[var(--visual-viewport-top,0px)] !translate-x-0 !translate-y-0 !max-w-none !w-full !h-[var(--visual-viewport-height,100dvh)] !max-h-none !rounded-none !border-0 !p-0 !gap-0 !overflow-hidden !animate-none flex flex-col bg-background"
      >
        <header className="shrink-0 border-b bg-background pt-[env(safe-area-inset-top)]">
          <div className="mx-auto flex max-w-4xl items-center gap-2 px-3 py-2 sm:px-6">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={() => void finalizeAndClose()}
              className="min-h-11 gap-1 px-2"
              aria-label="Save and close"
            >
              <ChevronLeft className="size-5" />
              <span className="hidden sm:inline">Back</span>
            </Button>
            <DialogTitle className="min-w-0 flex-1 truncate text-base">
              {editingItem
                ? kind[0].toUpperCase() + kind.slice(1)
                : `New ${kind}`}
            </DialogTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={saving}
                  className="size-11 text-muted-foreground"
                  aria-label="Note options"
                >
                  <MoreHorizontal className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="[&_[role=menuitem]]:min-h-11"
              >
                <DropdownMenuItem
                  onClick={() => setPinned((previous) => !previous)}
                >
                  {pinned ? <PinOff /> : <Pin />}
                  {pinned ? "Unpin" : "Pin to top"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={discardChanges}>
                  <X />
                  {editingItem ? "Discard changes" : "Discard draft"}
                </DropdownMenuItem>
                {editingItem && onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => void handleDelete()}
                    >
                      <Trash2 />
                      Move to trash
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              disabled={saving}
              onClick={() => void finalizeAndClose()}
              className="min-h-11 min-w-20"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </header>
        <DialogDescription className="sr-only">
          Write a {kind}. Save or go back to keep your changes. Extra
          organization is optional.
        </DialogDescription>
        {folder?.householdId && (
          <p className="shrink-0 border-b bg-primary/5 px-5 py-2 text-sm">
            Shared with family members who can access {folder.name}. Saving changes updates it for them too.
          </p>
        )}
        {error && (
          <div
            role="alert"
            id="draft-error"
            className="shrink-0 border-b bg-destructive/10 px-5 py-3 text-sm text-destructive"
          >
            <p className="mx-auto max-w-3xl">{error.message}</p>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(2rem,env(safe-area-inset-bottom))]">
          <fieldset
            disabled={saving}
            className="mx-auto w-full min-w-0 max-w-3xl space-y-6 px-5 py-5 sm:px-8 sm:py-8"
          >
            {!editingItem && (
              <Tabs
                value={type}
                onValueChange={(value) => {
                  setType(value as ItemType);
                  setError(null);
                  setPreviewing(false);
                  requestAnimationFrame(() =>
                    document
                      .getElementById(
                        value === "note"
                          ? "content"
                          : value === "url"
                          ? "url"
                          : "title"
                      )
                      ?.focus()
                  );
                }}
              >
                <TabsList className="h-auto w-full p-1 sm:w-auto">
                  <TabsTrigger
                    value="note"
                    className="min-h-11 flex-1 gap-2 px-4"
                  >
                    <FileText className="size-4" />
                    Note
                  </TabsTrigger>
                  <TabsTrigger
                    value="url"
                    className="min-h-11 flex-1 gap-2 px-4"
                  >
                    <Link2 className="size-4" />
                    Link
                  </TabsTrigger>
                  <TabsTrigger
                    value="reminder"
                    className="min-h-11 flex-1 gap-2 px-4"
                  >
                    <Bell className="size-4" />
                    Reminder
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            {type === "url" && (
              <div className="space-y-2">
                <Label htmlFor="url">Website address</Label>
                <Input
                  id="url"
                  type="url"
                  inputMode="url"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Paste a link, or type example.com"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="min-h-12 text-base"
                  aria-invalid={error?.field === "url"}
                  aria-describedby={
                    error?.field === "url" ? "draft-error" : undefined
                  }
                />
              </div>
            )}
            <div>
              <Label htmlFor="title" className="sr-only">
                {type === "note" || type === "url"
                  ? "Title (optional)"
                  : "Reminder title"}
              </Label>
              <Input
                id="title"
                placeholder={
                  type === "url"
                    ? "Title (optional)"
                    : type === "reminder"
                    ? "What do you need to do?"
                    : "Title (optional)"
                }
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="h-auto min-h-12 rounded-none border-0 bg-transparent px-0 text-2xl! font-semibold leading-8 shadow-none placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent"
              />
              {pinned && (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Pin className="size-3" />
                  Pinned to top
                </p>
              )}
            </div>
            {type === "reminder" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0 space-y-2">
                  <Label htmlFor="reminderDate">{recurrence === "none" ? "Date and time (optional)" : "Start date and time"}</Label>
                  <Input
                    id="reminderDate"
                    type="datetime-local"
                    value={reminderDate}
                    onChange={(event) => setReminderDate(event.target.value)}
                    className="min-h-11 max-w-full"
                    aria-invalid={error?.field === "reminderDate"}
                    aria-describedby={
                      error?.field === "reminderDate"
                        ? "draft-error"
                        : undefined
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="recurrence">Repeat</Label>
                  <select
                    id="recurrence"
                    value={recurrence}
                    onChange={(event) =>
                      setRecurrence(event.target.value as RecurrenceRule)
                    }
                    className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Every day</option>
                    <option value="weekly">Every week</option>
                    <option value="monthly">Every month</option>
                    <option value="yearly">Every year</option>
                  </select>
                  {recurrence === "yearly" && <p className="text-xs leading-5 text-muted-foreground">For birthdays and anniversaries. February 29 uses February 28 in non-leap years.</p>}
                  {recurrence === "monthly" && <p className="text-xs leading-5 text-muted-foreground">Shorter months use their last day, then return to your chosen day.</p>}
                </div>
                <div className="border-t border-border/60 pt-1 sm:col-span-2">
                  <ReminderSchedule item={{ reminderDate, recurrence, reminderCompleted: editingItem?.reminderCompleted }} />
                  {recurrence !== "none" && !reminderDate && <p className="mt-2 text-sm text-muted-foreground">Choose a start date to see the next occurrence.</p>}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label
                  htmlFor="content"
                  className={type === "note" ? "sr-only" : "text-sm"}
                >
                  {type === "note" ? "Note text" : "Notes (optional)"}
                </Label>
                {type === "note" && (
                  <>
                    {!previewing && (
                      <div
                        className="flex items-center gap-1"
                        role="group"
                        aria-label="List formatting"
                      >
                        {(
                          [
                            {
                              mode: "checklist",
                              label: "Checklist",
                              icon: ListChecks,
                            },
                            {
                              mode: "bullet",
                              label: "Bullet list",
                              icon: List,
                            },
                            {
                              mode: "numbered",
                              label: "Numbered list",
                              icon: ListOrdered,
                            },
                            {
                              mode: "lettered",
                              label: "Lettered list",
                              icon: ALargeSmall,
                            },
                          ] as const
                        ).map((entry) => (
                          <Button
                            key={entry.mode}
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "size-11 text-muted-foreground",
                              activeListMode === entry.mode &&
                                "bg-muted text-foreground"
                            )}
                            aria-label={entry.label}
                            aria-pressed={activeListMode === entry.mode}
                            title={entry.label}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => insertListPrefix(entry.mode)}
                          >
                            <entry.icon className="size-4" />
                          </Button>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={!content}
                      className="ml-auto min-h-11 gap-2 text-muted-foreground"
                      onClick={() => setPreviewing((previous) => !previous)}
                    >
                      {previewing ? (
                        <Pencil className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                      {previewing ? "Edit" : "Preview"}
                    </Button>
                  </>
                )}
              </div>
              {previewing && type === "note" ? (
                <div className="min-h-[35dvh] break-words py-2">
                  <MarkdownPreview
                    content={content}
                    onToggleTask={toggleTaskAtIndex}
                  />
                </div>
              ) : (
                <Textarea
                  ref={textareaRef}
                  id="content"
                  placeholder={
                    type === "note" ? "Start writing…" : "Add a little context…"
                  }
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  onInput={handleTextareaInput}
                  onFocus={handleTextareaInput}
                  onKeyDown={type === "note" ? handleContentKeyDown : undefined}
                  rows={type === "note" ? 10 : 4}
                  aria-invalid={error?.field === "content"}
                  aria-describedby={
                    error?.field === "content" ? "draft-error" : undefined
                  }
                  className={cn(
                    "resize-none rounded-none border-0 bg-transparent px-0 text-base leading-7 shadow-none placeholder:text-muted-foreground focus-visible:ring-0 dark:bg-transparent",
                    type === "note" && "min-h-[35dvh]"
                  )}
                />
              )}
            </div>

            <div className="border-t pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setDetailsOpen((previous) => !previous)}
                className="flex min-h-12 w-full items-center gap-3 text-left text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                aria-expanded={detailsOpen}
                aria-controls="note-organization"
              >
                <span className="shrink-0 font-medium">Organize</span>
                <span className="min-w-0 flex-1 truncate">
                  {[
                    folder?.name,
                    tags.length
                      ? `${tags.length} tag${tags.length === 1 ? "" : "s"}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Folder and tags"}
                </span>
                <ChevronDown
                  className={cn("size-4 shrink-0", detailsOpen && "rotate-180")}
                />
              </button>
              {detailsOpen && (
                <div id="note-organization" className="space-y-5 py-4">
                  {folders.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="folder-select">Folder</Label>
                      <Select
                        disabled={!!editingItem?.householdId}
                        value={folderId || "none"}
                        onValueChange={(value) =>
                          setFolderId(value === "none" ? undefined : value)
                        }
                      >
                        <SelectTrigger
                          id="folder-select"
                          className="min-h-11 w-full"
                        >
                          <SelectValue placeholder="No folder" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No folder</SelectItem>
                          {folders.filter((entry) => !entry.householdId || entry.canWrite === true || entry.clientId === folderId).map((entry) => (
                            <SelectItem
                              key={entry.clientId}
                              value={entry.clientId}
                            >
                              {entry.name}
                              {entry.householdId
                                ? " · Shared with household"
                                : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {folder?.householdId && (
                        <p className="text-sm text-muted-foreground">
                          Items in this folder are shared with accepted family members who have access.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="space-y-3">
                    <Label htmlFor="note-tag">Tags</Label>
                    <div className="flex gap-2">
                      <Input
                        id="note-tag"
                        placeholder="Add a tag"
                        className="min-h-11"
                        value={tagInput}
                        onChange={(event) => setTagInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (
                            event.key === "Enter" &&
                            !event.nativeEvent.isComposing
                          ) {
                            event.preventDefault();
                            handleAddTag();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={!tagInput.trim()}
                        className="min-h-11"
                        onClick={handleAddTag}
                      >
                        Add
                      </Button>
                    </div>
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="gap-1 py-0 pl-3 pr-0 text-sm"
                          >
                            {tag}
                            <button
                              type="button"
                              aria-label={`Remove tag ${tag}`}
                              className="flex size-11 items-center justify-center rounded-full hover:text-destructive"
                              onClick={() => handleRemoveTag(tag)}
                            >
                              <X className="size-3.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {allTags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {allTags
                          .filter(
                            (tag) =>
                              !tags.includes(tag) &&
                              (!tagInput ||
                                tag
                                  .toLowerCase()
                                  .includes(tagInput.toLowerCase()))
                          )
                          .slice(0, 8)
                          .map((tag) => (
                            <Button
                              key={tag}
                              type="button"
                              variant="outline"
                              className="min-h-11"
                              onClick={() => {
                                setTags((previous) => [...previous, tag]);
                                setTagInput("");
                              }}
                            >
                              + {tag}
                            </Button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </fieldset>
        </div>
      </DialogContent>
    </Dialog>
  );
}
