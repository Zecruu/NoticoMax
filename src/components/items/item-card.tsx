"use client";

import { type LocalItem, type LocalFolder } from "@/lib/db/indexed-db";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
  FileText,
  Link2,
  Bell,
  Check,
  Copy,
  Share2,
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
}

const typeConfig = {
  note: { icon: FileText, label: "Note", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  url: { icon: Link2, label: "URL", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
  reminder: { icon: Bell, label: "Reminder", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
};

export function ItemCard({ item, folder, onEdit, onDelete, onTogglePin, onToggleComplete }: ItemCardProps) {
  const config = typeConfig[item.type];
  const TypeIcon = config.icon;

  const isOverdue =
    item.type === "reminder" &&
    item.reminderDate &&
    !item.reminderCompleted &&
    new Date(item.reminderDate) < new Date();

  return (
    <Card
      className={cn(
        "group relative transition-all hover:shadow-md cursor-pointer",
        item.pinned && "ring-1 ring-primary/20",
        isOverdue && "ring-1 ring-destructive/30"
      )}
      onClick={() => onEdit(item)}
    >
      <CardHeader className="flex flex-row items-start gap-3 space-y-0 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className={cn("text-[10px] gap-1", config.color)}>
              <TypeIcon className="h-2.5 w-2.5" />
              {config.label}
            </Badge>
            {folder && (
              <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
                <div
                  className="h-1.5 w-1.5 rounded-sm"
                  style={{ backgroundColor: folder.color || "#6b7280" }}
                />
                {folder.name}
              </Badge>
            )}
            {item.pinned && (
              <Pin className="h-3 w-3 text-primary fill-primary" />
            )}
          </div>
          <h3 className="font-semibold text-sm leading-tight truncate">
            {item.title}
          </h3>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                onEdit(item);
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-2" />
              Edit
            </DropdownMenuItem>
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
                onDelete(item.clientId);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>

      <CardContent className="pt-0">
        {item.type === "url" && item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-primary hover:underline mb-2 truncate"
          >
            <ExternalLink className="h-3 w-3 shrink-0" />
            <span className="truncate">{item.url}</span>
          </a>
        )}

        {item.content && (
          <div className="text-xs text-muted-foreground line-clamp-3 overflow-hidden">
            <MarkdownRenderer content={item.content} compact />
          </div>
        )}

        {item.type === "reminder" && item.reminderDate && (
          <p
            className={cn(
              "text-xs mt-2 font-medium",
              item.reminderCompleted
                ? "text-muted-foreground line-through"
                : isOverdue
                  ? "text-destructive"
                  : "text-muted-foreground"
            )}
          >
            {item.reminderCompleted ? "✓ " : ""}
            {new Date(item.reminderDate).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}

        {item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {item.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                {tag}
              </Badge>
            ))}
          </div>
        )}

        {item.content && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(item.content);
              toast.success("Copied to clipboard");
            }}
            className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground/50 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
