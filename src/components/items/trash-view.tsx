"use client";

import { type LocalItem } from "@/lib/db/indexed-db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, RotateCcw, FileText, Link2, Bell, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface TrashViewProps {
  items: LocalItem[];
  onRestore: (clientId: string) => Promise<void>;
  onPermanentDelete: (clientId: string) => Promise<void>;
}

const typeIcons = {
  note: FileText,
  url: Link2,
  reminder: Bell,
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function TrashView({ items, onRestore, onPermanentDelete }: TrashViewProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Trash2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
        <h3 className="text-sm font-medium text-muted-foreground">Trash is empty</h3>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Deleted items will appear here for 30 days
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        Items are permanently deleted after 30 days
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const Icon = typeIcons[item.type];
          return (
            <Card key={item.clientId} className="relative">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] gap-1">
                    <Icon className="h-2.5 w-2.5" />
                    {item.type}
                  </Badge>
                  {item.deletedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      Deleted {timeAgo(item.deletedAt)}
                    </span>
                  )}
                </div>

                <h3 className="text-sm font-semibold truncate">{item.title}</h3>

                {item.content && (
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {item.content}
                  </p>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1.5 text-xs h-7"
                    onClick={() => {
                      onRestore(item.clientId);
                      toast.success("Item restored");
                    }}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn("flex-1 gap-1.5 text-xs h-7 text-destructive hover:text-destructive")}
                    onClick={() => {
                      onPermanentDelete(item.clientId);
                      toast.success("Permanently deleted");
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
