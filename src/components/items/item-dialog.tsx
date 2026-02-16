"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { type LocalItem, type ItemType, type LocalFolder } from "@/lib/db/indexed-db";
import {
  Dialog,
  DialogContent,
  DialogHeader,
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
import { FileText, Link2, Bell, X, Eye, Pencil, List, ListOrdered, ALargeSmall } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

interface ItemDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (item: Omit<LocalItem, "id" | "clientId" | "createdAt" | "updatedAt" | "deleted">) => void;
  onUpdate?: (clientId: string, updates: Partial<LocalItem>) => void;
  editingItem?: LocalItem | null;
  folders: LocalFolder[];
  defaultFolderId?: string | null;
  defaultType?: ItemType;
  allTags?: string[];
}

export function ItemDialog({ open, onClose, onSave, onUpdate, editingItem, folders, defaultFolderId, defaultType = "note", allTags = [] }: ItemDialogProps) {
  const [type, setType] = useState<ItemType>("note");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState(false);
  const [folderId, setFolderId] = useState<string | undefined>(undefined);
  const [previewing, setPreviewing] = useState(false);
  const [activeListMode, setActiveListMode] = useState<"bullet" | "numbered" | "lettered" | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleContentKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;

    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const text = ta.value;

    // Find the current line
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const line = text.slice(lineStart, start);

    // Detect list prefix on current line
    const bulletMatch = line.match(/^(- )(.*)/);
    const numberedMatch = line.match(/^(\d+)\. (.*)/);
    const letteredMatch = line.match(/^([a-z])\. (.*)/);

    let nextPrefix = "";
    let isEmpty = false;

    if (numberedMatch) {
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

  const insertListPrefix = useCallback((mode: "bullet" | "numbered" | "lettered") => {
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

    // Check if non-empty lines already have this prefix (for toggling off)
    const prefixPatterns = {
      bullet: /^- /,
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
      const stripAll = /^(?:- |\d+\. |[a-z]\. )/;
      newLines = lines.map((line, i) => {
        const stripped = line.replace(stripAll, "");
        switch (mode) {
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
        editingItem.reminderDate
          ? new Date(editingItem.reminderDate).toISOString().slice(0, 16)
          : ""
      );
      setTags(editingItem.tags);
      setPinned(editingItem.pinned);
      setFolderId(editingItem.folderId || undefined);
    } else {
      setType(defaultType);
      setTitle("");
      setContent("");
      setUrl("");
      setReminderDate("");
      setTags([]);
      setPinned(false);
      setFolderId(defaultFolderId || undefined);
    }
    setPreviewing(false);
    setActiveListMode(null);
  }, [editingItem, open, defaultFolderId, defaultType]);

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

  const handleSubmit = () => {
    if (!title.trim()) return;

    const itemData = {
      type,
      title: title.trim(),
      content: content.trim(),
      url: type === "url" ? url.trim() : undefined,
      reminderDate: type === "reminder" && reminderDate ? reminderDate : undefined,
      reminderCompleted: editingItem?.reminderCompleted || false,
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

    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingItem ? "Edit Item" : "New Item"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

          {folders.length > 0 && (
            <div className="space-y-2">
              <Label>Folder</Label>
              <Select
                value={folderId || "none"}
                onValueChange={(v) => setFolderId(v === "none" ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No folder" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No folder</SelectItem>
                  {folders.map((folder) => (
                    <SelectItem key={folder.clientId} value={folder.clientId}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: folder.color || "#6b7280" }}
                        />
                        {folder.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder={
                type === "note"
                  ? "Note title..."
                  : type === "url"
                    ? "Bookmark name..."
                    : "Reminder title..."
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

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
            <div className="space-y-2">
              <Label htmlFor="reminderDate">Date & Time</Label>
              <Input
                id="reminderDate"
                type="datetime-local"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
              />
            </div>
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
              <div className="min-h-[150px] max-h-[300px] overflow-auto rounded-md border bg-background p-3">
                <MarkdownRenderer content={content} />
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
                onKeyDown={type === "note" ? handleContentKeyDown : undefined}
                rows={type === "note" ? 6 : 3}
              />
            )}
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!title.trim()}>
              {editingItem ? "Save Changes" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
