"use client";

import { useRef, useState } from "react";
import type { LocalItem, LocalFolder } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pin,
  PinOff,
  MoreHorizontal,
  Pencil,
  Trash2,
  ExternalLink,
  Share2,
  CheckCircle2,
  Circle,
  Copy,
  FileText,
  Link2,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/native-toast";
import {
  checklistTasks,
  linkLabel,
  normalizeWebUrl,
  notePreview,
  toggleChecklistTask,
} from "@/lib/items/draft";

interface ItemCardProps {
  item: LocalItem;
  folder?: LocalFolder;
  onEdit: (item: LocalItem) => void;
  onDelete: (clientId: string) => void;
  onTogglePin: (clientId: string, pinned: boolean) => void;
  onToggleComplete?: (clientId: string, completed: boolean) => void;
  onUpdateContent?: (clientId: string, content: string) => void;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  if (date.toDateString() === now.toDateString())
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear()
      ? { year: "2-digit" as const }
      : {}),
  });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* Selection fallback for older webviews. */
  }
  const previous = document.activeElement;
  const field = document.createElement("textarea");
  field.value = text;
  field.readOnly = true;
  field.style.cssText = "position:fixed;opacity:0;pointer-events:none";
  document.body.appendChild(field);
  try {
    field.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    field.remove();
    if (previous instanceof HTMLElement)
      previous.focus({ preventScroll: true });
  }
}

export function ItemCard({
  item,
  folder,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleComplete,
  onUpdateContent,
}: ItemCardProps) {
  const updatingRef = useRef(false);
  const [updating, setUpdating] = useState(false);
  const update = async (action: () => void | Promise<void>) => {
    if (updatingRef.current) return;
    updatingRef.current = true;
    setUpdating(true);
    try {
      await action();
    } catch {
      toast.error("Couldn't save that change. Try again.");
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  };
  const tasks = item.type === "note" ? checklistTasks(item.content) : [];
  const preview = notePreview(item.content, item.title);
  const safeUrl =
    item.type === "url" && item.url ? normalizeWebUrl(item.url) : null;
  const overdue =
    item.type === "reminder" &&
    !!item.reminderDate &&
    !item.reminderCompleted &&
    new Date(item.reminderDate) < new Date();
  const Icon =
    item.type === "url" ? Link2 : item.type === "reminder" ? Bell : FileText;
  const handleCopy = async () => {
    const copied = await copyText(
      item.type === "url" && item.url
        ? item.url
        : item.content.trim() || item.title
    );
    if (copied) toast.success(item.type === "url" ? "Link copied" : "Copied");
    else toast.error("Couldn't copy. Open the note to select its text.");
  };

  return (
    <article className="group relative border-b border-border/60 py-1 last:border-b-0">
      <div className="flex items-start gap-1 sm:gap-2">
        {item.type === "reminder" && onToggleComplete ? (
          <button
            type="button"
            disabled={updating}
            onClick={() =>
              void update(() =>
                onToggleComplete(item.clientId, item.reminderCompleted ?? false)
              )
            }
            aria-label={`${
              item.reminderCompleted ? "Mark incomplete" : "Complete"
            }: ${item.title}`}
            className="mt-1 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            {item.reminderCompleted ? (
              <CheckCircle2 className="size-5 text-primary" />
            ) : (
              <Circle className={cn("size-5", overdue && "text-destructive")} />
            )}
          </button>
        ) : (
          <div
            className="mt-1 hidden size-11 shrink-0 items-center justify-center text-muted-foreground sm:flex"
            aria-hidden="true"
          >
            <Icon className="size-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onEdit(item)}
            aria-label={`Open ${item.title}`}
            className="block w-full rounded-lg px-2 py-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring sm:px-3"
          >
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  "line-clamp-2 break-words text-base font-semibold leading-6",
                  item.reminderCompleted && "text-muted-foreground line-through"
                )}
              >
                {item.title}
              </span>
              {item.pinned && (
                <Pin
                  aria-label="Pinned"
                  className="size-3.5 shrink-0 text-muted-foreground"
                />
              )}
            </span>
            {!tasks.length && preview && (
              <span className="mt-1 block line-clamp-2 break-words text-sm leading-6 text-muted-foreground">
                {preview}
              </span>
            )}
            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-5 text-muted-foreground">
              <span>{formatRelative(item.updatedAt)}</span>
              {folder && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="max-w-40 truncate">
                    {folder.householdId ? "Shared · " : ""}
                    {folder.name}
                  </span>
                </>
              )}
              {item.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="max-w-28 truncate">
                  #{tag}
                </span>
              ))}
              {item.tags.length > 2 && <span>+{item.tags.length - 2}</span>}
            </span>
            {item.type === "reminder" && item.reminderDate && (
              <span
                className={cn(
                  "mt-1 block text-sm",
                  overdue ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {item.reminderCompleted
                  ? "Completed · "
                  : overdue
                  ? "Overdue · "
                  : "Due · "}
                {new Date(item.reminderDate).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </span>
            )}
          </button>
          {safeUrl && (
            <a
              href={safeUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Visit ${linkLabel(safeUrl)}`}
              className="mb-1 inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg px-2 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring sm:px-3"
            >
              <Link2 className="size-4 shrink-0" />
              <span className="truncate">{linkLabel(safeUrl)}</span>
              <ExternalLink className="size-3.5 shrink-0" />
            </a>
          )}
          {tasks.length > 0 && (
            <div className="mb-2 px-2 sm:px-3">
              {tasks.slice(0, 3).map((task) => (
                <button
                  key={task.index}
                  type="button"
                  role="checkbox"
                  aria-checked={task.checked}
                  aria-label={task.text}
                  disabled={!onUpdateContent || updating}
                  onClick={() =>
                    void update(() =>
                      onUpdateContent?.(
                        item.clientId,
                        toggleChecklistTask(item.content, task.index)
                      )
                    )
                  }
                  className="flex min-h-11 w-full items-center gap-2 rounded-md text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-70"
                >
                  {task.checked ? (
                    <CheckCircle2 className="size-4 shrink-0 text-primary" />
                  ) : (
                    <Circle className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "line-clamp-2 break-words",
                      task.checked && "text-muted-foreground line-through"
                    )}
                  >
                    {task.text}
                  </span>
                </button>
              ))}
              {tasks.length > 3 && (
                <button
                  type="button"
                  onClick={() => onEdit(item)}
                  className="min-h-11 text-sm text-muted-foreground underline-offset-4 hover:underline"
                >
                  View {tasks.length - 3} more{" "}
                  {tasks.length === 4 ? "task" : "tasks"}
                </button>
              )}
            </div>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mt-1 size-11 shrink-0 text-muted-foreground"
              aria-label={`Options for ${item.title}`}
            >
              <MoreHorizontal className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-44 [&_[role=menuitem]]:min-h-11"
          >
            <DropdownMenuItem onClick={() => onEdit(item)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onTogglePin(item.clientId, item.pinned)}
            >
              {item.pinned ? <PinOff /> : <Pin />}
              {item.pinned ? "Unpin" : "Pin to top"}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopy}>
              <Copy />
              {item.type === "url" ? "Copy link" : "Copy text"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={async () => {
                try {
                  const res = await fetch("/api/share", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clientId: item.clientId }),
                  });
                  if (!res.ok) throw new Error();
                  const { shareId } = await res.json();
                  if (
                    !(await copyText(
                      `${window.location.origin}/shared/${shareId}`
                    ))
                  )
                    throw new Error();
                  toast.success("Share link copied");
                } catch {
                  toast.error(
                    "Couldn't create a share link. Check your connection and try again."
                  );
                }
              }}
            >
              <Share2 />
              Share link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => {
                if (confirm(`Move "${item.title}" to trash?`))
                  onDelete(item.clientId);
              }}
            >
              <Trash2 />
              Move to trash
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  );
}
