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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";
import { MarkdownRenderer } from "@/components/markdown-renderer";

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

// First non-empty line of content with markdown prefixes stripped, for the
// muted preview snippet beside the date.
function firstLinePreview(content: string): string {
  const line = content
    .split("\n")
    .map((l) => l.replace(/^(?:- \[[ xX]\] |- |\d+\. |[a-z]\. |#+\s+)/, "").trim())
    .find((l) => l.length > 0);
  return line ?? "";
}

export function ItemCard({ item, folder, onEdit, onDelete, onTogglePin, onToggleComplete, onUpdateContent }: ItemCardProps) {
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

  return (
    <Card
      className={cn(
        "group relative transition-colors hover:bg-muted/40 rounded-lg",
        item.pinned && "ring-1 ring-primary/20",
        isOverdue && "ring-1 ring-destructive/30",
      )}
    >
      <div className="flex items-start gap-2 p-3">
        {/* Reminder check toggle pulls to the very left so it lines up with the row */}
        {item.type === "reminder" && onToggleComplete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleComplete(item.clientId, item.reminderCompleted || false);
            }}
            aria-label={item.reminderCompleted ? "Mark incomplete" : "Mark complete"}
            className="mt-0.5 shrink-0 transition-transform active:scale-95"
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
                  "font-semibold text-sm truncate",
                  item.reminderCompleted && "line-through text-muted-foreground",
                )}
              >
                {item.title}
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

          {/* Date · preview line (Apple-Notes style) */}
          <div className="flex items-baseline gap-1.5 text-[11px] text-muted-foreground mt-0.5">
            <span className="shrink-0 tabular-nums">{displayDate}</span>
            {preview && (
              <>
                <span aria-hidden>·</span>
                <span className="truncate">{preview}</span>
              </>
            )}
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

          {/* Task list — tappable circles inline */}
          {hasTaskList && (
            <div className="mt-1.5 text-xs text-muted-foreground">
              <MarkdownRenderer content={item.content} compact onToggleTask={handleToggleTask} />
            </div>
          )}

          {/* Tags */}
          {item.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {item.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Right-side action column: pencil + kebab, vertically stacked, subtle */}
        <div className="flex items-center gap-0.5 shrink-0 -mr-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            aria-label="Edit"
            title="Edit"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                aria-label="More"
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleComplete(item.clientId, item.reminderCompleted || false);
                  }}
                >
                  <Check className="h-3.5 w-3.5 mr-2" />
                  {item.reminderCompleted ? "Mark incomplete" : "Mark complete"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
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
                className="text-destructive"
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
