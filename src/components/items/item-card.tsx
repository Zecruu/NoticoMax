"use client";

import { type LocalItem, type LocalFolder } from "@/lib/db/indexed-db";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pin,
  PinOff,
  MoreVertical,
  Pencil,
  Trash2,
  ExternalLink,
  Check,
  Share2,
  CheckCircle2,
  Circle,
  Copy,
  Maximize2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { getUrlCategoryLabel, withoutUrlCategoryTags } from "@/lib/url-categories";

interface ItemCardProps {
  item: LocalItem;
  folder?: LocalFolder;
  onEdit: (item: LocalItem) => void;
  onDelete: (clientId: string) => void;
  onTogglePin: (clientId: string, pinned: boolean) => void;
  onToggleComplete?: (clientId: string, completed: boolean) => void;
  onUpdateContent?: (clientId: string, content: string) => void;
}

// Apple-Notes-style relative date: time today, "Yesterday", short date in
// current year, M/D/YY for older items.
function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  )
    return "Yesterday";
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "numeric", day: "numeric", year: "2-digit" });
}

// Compact plain-text preview with markdown list prefixes removed.
function firstLinePreview(content: string): string {
  return content
    .split("\n")
    .map((l) => l.replace(/^(?:- \[[ xX]\] |- |\d+\. |[a-z]\. |#+\s+)/, "").trim())
    .filter(Boolean)
    .join(" ");
}

// What "Copy" yields per item type. URLs hand back the link; everything
// else prefers content, falling back to title when content is empty.
function copyPayloadFor(item: LocalItem): string {
  if (item.type === "url" && item.url) return item.url;
  const trimmed = item.content.trim();
  return trimmed || item.title;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* falls through to legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function ItemCard({ item, folder, onEdit, onDelete, onTogglePin, onToggleComplete, onUpdateContent }: ItemCardProps) {
  const ordinaryTags = withoutUrlCategoryTags(item.tags);
  const urlCategory = item.type === "url" ? getUrlCategoryLabel(item.tags) : null;
  // The Maximize button shows only when there's meaningful body content beyond
  // the one-line preview (or beyond the inline checklist for task notes). It
  // opens the full-screen note editor (same target as the pencil).
  const hasExpandableContent =
    (item.content?.trim().length ?? 0) > 0 ||
    (item.type === "url" && (item.url?.length ?? 0) > 0);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const payload = copyPayloadFor(item);
    if (!payload) return;
    const ok = await copyToClipboard(payload);
    if (ok) {
      const kind = item.type === "url" ? "URL" : "Note";
      toast.success(`${kind} copied`);
    } else {
      toast.error("Copy failed");
    }
  };

  const handleToggleTask = onUpdateContent
    ? (index: number) => {
        let count = 0;
        const next = item.content.replace(
          /^(\s*[-*+]\s+\[)([ xX])(\])/gm,
          (m, pre, mark, post) => {
            if (count++ !== index) return m;
            return pre + (mark === " " ? "x" : " ") + post;
          },
        );
        if (next !== item.content) onUpdateContent(item.clientId, next);
      }
    : undefined;

  const isOverdue =
    item.type === "reminder" &&
    item.reminderDate &&
    !item.reminderCompleted &&
    new Date(item.reminderDate) < new Date();

  const hasTaskList = /^\s*[-*+]\s+\[[ xX]\]/m.test(item.content);
  const preview = item.type === "note" && !hasTaskList ? firstLinePreview(item.content) : "";
  const displayDate = formatRelative(item.updatedAt);
  const handleOpen = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, [role='menuitem']")) return;
    onEdit(item);
  };

  return (
    <Card
      onClick={handleOpen}
      className={cn(
        "group relative cursor-pointer gap-0 rounded-none border-x-0 border-t-0 py-0 shadow-none transition-colors hover:bg-muted/40 md:rounded-lg md:border md:shadow-sm",
        item.pinned && "bg-primary/[0.03] md:ring-1 md:ring-primary/20",
        isOverdue && "md:ring-1 md:ring-destructive/30",
      )}
    >
      <div className="flex min-h-20 items-start gap-2 px-4 py-3 md:min-h-0 md:p-3">
        {/* Reminder check toggle pulls to the very left so it lines up with the row */}
        {item.type === "reminder" && onToggleComplete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(item.clientId, item.reminderCompleted || false);
            }}
            aria-label={item.reminderCompleted ? "Mark incomplete" : "Mark complete"}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center transition-transform active:scale-95 md:ml-0 md:mt-0.5 md:h-7 md:w-7"
          >
            {item.reminderCompleted ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Circle className={cn("h-5 w-5", isOverdue ? "text-destructive" : "text-muted-foreground")} />
            )}
          </button>
        )}

        <div className="flex-1 min-w-0">
          {/* Title row: title on the left, folder badge on the right */}
          <div className="flex items-baseline gap-2">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {item.pinned && (
                <Pin className="h-3 w-3 text-primary fill-primary shrink-0" />
              )}
              <h3
                className={cn(
                  "truncate text-[15px] font-semibold md:text-sm",
                  item.reminderCompleted && "line-through text-muted-foreground",
                )}
              >
                {item.title || "Untitled note"}
              </h3>
            </div>
            {folder && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0 max-w-[40%] truncate">
                <span
                  className="h-1.5 w-1.5 rounded-sm shrink-0"
                  style={{ backgroundColor: folder.color || "#6b7280" }}
                />
                <span className="truncate">{folder.name}</span>
              </span>
            )}
          </div>

          {/* Date and type-specific timing metadata */}
          <div className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <span className="shrink-0 tabular-nums">{displayDate}</span>
            {item.type === "reminder" && item.reminderDate && (
              <>
                <span aria-hidden>·</span>
                <span
                  className={cn(
                    "truncate",
                    isOverdue && !item.reminderCompleted && "text-destructive",
                  )}
                >
                  {new Date(item.reminderDate).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              </>
            )}
          </div>

          {preview && (
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
              {preview}
            </p>
          )}

          {/* URL bookmarks: surface the link */}
          {item.type === "url" && item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-primary hover:underline mt-1 truncate"
            >
              <ExternalLink className="h-3 w-3 shrink-0" />
              <span className="truncate">{item.url}</span>
            </a>
          )}

          {urlCategory && (
            <Badge variant="secondary" className="mt-1.5 h-5 px-1.5 text-[10px] font-medium">
              {urlCategory}
            </Badge>
          )}

          {/* Task list — tappable circles inline */}
          {hasTaskList && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              <MarkdownRenderer content={item.content} compact onToggleTask={handleToggleTask} />
            </div>
          )}

          {/* Tags */}
          {ordinaryTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {ordinaryTags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

        </div>

        {/* Mobile keeps one 44px overflow target; desktop retains direct shortcuts. */}
        <div className="flex items-center gap-0.5 shrink-0 -mr-1">
          {hasExpandableContent && (
            <Button
              variant="ghost"
              size="icon"
              className="hidden h-7 w-7 text-muted-foreground hover:text-foreground md:inline-flex"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
              aria-label="Open full note"
              title="Open full note"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-7 w-7 text-muted-foreground hover:text-foreground md:inline-flex"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            aria-label="Edit"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-7 w-7 text-muted-foreground hover:text-foreground md:inline-flex"
            onClick={handleCopy}
            aria-label="Copy"
            title={item.type === "url" ? "Copy URL" : "Copy note"}
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground hover:text-foreground md:h-7 md:w-7"
                aria-label="More"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="min-h-11 md:min-h-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onTogglePin(item.clientId, item.pinned);
                }}
              >
                {item.pinned ? (
                  <>
                    <PinOff className="h-3.5 w-3.5 mr-2" />
                    Unpin
                  </>
                ) : (
                  <>
                    <Pin className="h-3.5 w-3.5 mr-2" />
                    Pin
                  </>
                )}
              </DropdownMenuItem>
              {item.type === "reminder" && onToggleComplete && (
                <DropdownMenuItem
                  className="min-h-11 md:min-h-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete(item.clientId, item.reminderCompleted || false);
                  }}
                >
                  <Check className="h-3.5 w-3.5 mr-2" />
                  {item.reminderCompleted ? "Mark incomplete" : "Mark complete"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="min-h-11 md:min-h-0" onClick={handleCopy}>
                <Copy className="h-3.5 w-3.5 mr-2" />
                {item.type === "url" ? "Copy URL" : "Copy"}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 md:min-h-0"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const res = await fetch("/api/share", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ clientId: item.clientId }),
                    });
                    if (!res.ok) throw new Error();
                    const { shareId } = await res.json();
                    const url = `${window.location.origin}/shared/${shareId}`;
                    await navigator.clipboard.writeText(url);
                    toast.success("Share link copied to clipboard");
                  } catch {
                    toast.error("Failed to create share link");
                  }
                }}
              >
                <Share2 className="h-3.5 w-3.5 mr-2" />
                Share
              </DropdownMenuItem>
              <DropdownMenuItem
                className="min-h-11 text-destructive md:min-h-0"
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Move "${item.title}" to trash?`)) {
                    onDelete(item.clientId);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </Card>
  );
}
