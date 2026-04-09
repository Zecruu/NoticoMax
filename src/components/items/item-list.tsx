"use client";

import { useMemo } from "react";
import { type LocalItem, type LocalFolder } from "@/lib/db/indexed-db";
import { ItemCard } from "./item-card";
import { Button } from "@/components/ui/button";
import { FileText, Link2, Bell, Inbox, FolderOpen, Plus, Monitor } from "lucide-react";
import { getDeviceDisplayName, getDeviceId } from "@/lib/device";

interface ItemListProps {
  items: LocalItem[];
  folders: LocalFolder[];
  loading: boolean;
  onEdit: (item: LocalItem) => void;
  onDelete: (clientId: string) => void;
  onTogglePin: (clientId: string, pinned: boolean) => void;
  onToggleComplete: (clientId: string, completed: boolean) => void;
  activeFilter: string;
  activeFolder: string | null;
  onCreateWithType?: (type: "note" | "url" | "reminder") => void;
  onCreateNew?: () => void;
}

const emptyMessages: Record<string, { icon: React.ElementType; message: string }> = {
  all: { icon: Inbox, message: "No items yet. Create your first note, bookmark, or reminder!" },
  note: { icon: FileText, message: "No notes yet. Start writing!" },
  url: { icon: Link2, message: "No bookmarks yet. Save your favorite URLs!" },
  reminder: { icon: Bell, message: "No reminders yet. Set one up!" },
  folder: { icon: FolderOpen, message: "This folder is empty. Add items to it!" },
};

const addButtonConfig: Record<string, { label: string; type: "note" | "url" | "reminder"; icon: React.ElementType }> = {
  note: { label: "Add Note", type: "note", icon: FileText },
  url: { label: "Add URL", type: "url", icon: Link2 },
  reminder: { label: "Add Reminder", type: "reminder", icon: Bell },
};

interface DeviceGroup {
  deviceId: string;
  deviceName: string;
  isCurrentDevice: boolean;
  items: LocalItem[];
}

export function ItemList({
  items,
  folders,
  loading,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleComplete,
  activeFilter,
  activeFolder,
  onCreateWithType,
  onCreateNew,
}: ItemListProps) {
  // Build a folder lookup map
  const folderMap = new Map(folders.map((f) => [f.clientId, f]));

  // Group items by device
  const deviceGroups = useMemo(() => {
    const currentDeviceId = getDeviceId();
    const groupMap = new Map<string, LocalItem[]>();

    for (const item of items) {
      const did = item.deviceId || "unknown";
      if (!groupMap.has(did)) groupMap.set(did, []);
      groupMap.get(did)!.push(item);
    }

    const groups: DeviceGroup[] = [];
    for (const [deviceId, deviceItems] of groupMap) {
      groups.push({
        deviceId,
        deviceName: getDeviceDisplayName(deviceId),
        isCurrentDevice: deviceId === currentDeviceId,
        items: deviceItems,
      });
    }

    // Current device first, then alphabetically by name
    groups.sort((a, b) => {
      if (a.isCurrentDevice !== b.isCurrentDevice) return a.isCurrentDevice ? -1 : 1;
      return a.deviceName.localeCompare(b.deviceName);
    });

    return groups;
  }, [items]);

  const hasMultipleDevices = deviceGroups.length > 1;

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 md:p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  const addBtn = addButtonConfig[activeFilter];

  if (items.length === 0) {
    const key = activeFolder ? "folder" : activeFilter;
    const empty = emptyMessages[key] || emptyMessages.all;
    const Icon = empty.icon;

    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Icon className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-sm">{empty.message}</p>
        {activeFolder && onCreateNew && (
          <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateNew}>
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </Button>
        )}
        {!activeFolder && addBtn && onCreateWithType && (
          <Button size="sm" className="mt-4 gap-1.5" onClick={() => onCreateWithType(addBtn.type)}>
            <Plus className="h-3.5 w-3.5" />
            {addBtn.label}
          </Button>
        )}
        {!activeFolder && !addBtn && onCreateNew && (
          <Button size="sm" className="mt-4 gap-1.5" onClick={onCreateNew}>
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex justify-end">
        {activeFolder && onCreateNew && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onCreateNew}>
            <Plus className="h-3.5 w-3.5" />
            Add Item
          </Button>
        )}
        {!activeFolder && addBtn && onCreateWithType && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => onCreateWithType(addBtn.type)}>
            <Plus className="h-3.5 w-3.5" />
            {addBtn.label}
          </Button>
        )}
      </div>

      {hasMultipleDevices ? (
        <div className="space-y-6">
          {deviceGroups.map((group) => (
            <div key={group.deviceId}>
              <div className="flex items-center gap-2 mb-3">
                <Monitor className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">
                  {group.deviceName}
                </h2>
                {group.isCurrentDevice && (
                  <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                    This device
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  ({group.items.length} {group.items.length === 1 ? "item" : "items"})
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.items.map((item) => (
                  <ItemCard
                    key={item.clientId}
                    item={item}
                    folder={item.folderId ? folderMap.get(item.folderId) : undefined}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onTogglePin={onTogglePin}
                    onToggleComplete={onToggleComplete}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <ItemCard
              key={item.clientId}
              item={item}
              folder={item.folderId ? folderMap.get(item.folderId) : undefined}
              onEdit={onEdit}
              onDelete={onDelete}
              onTogglePin={onTogglePin}
              onToggleComplete={onToggleComplete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
