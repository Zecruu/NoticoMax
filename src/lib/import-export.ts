import db, { type LocalItem, type LocalFolder } from "@/lib/db/indexed-db";
import { createItem, createFolder } from "@/lib/sync/sync-engine";

interface ExportData {
  version: 1;
  exportedAt: string;
  items: LocalItem[];
  folders: LocalFolder[];
}

export async function exportData(): Promise<Blob> {
  const items = await db.items.toArray();
  const folders = await db.folders.toArray();

  const data: ExportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
    folders,
  };

  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

export async function importData(json: string): Promise<{ items: number; folders: number }> {
  const data = JSON.parse(json) as ExportData;

  if (!data.version || !Array.isArray(data.items)) {
    throw new Error("Invalid export file format");
  }

  let itemCount = 0;
  let folderCount = 0;

  // Import folders first so items can reference them
  if (data.folders) {
    for (const folder of data.folders) {
      if (folder.deleted) continue;
      await createFolder({
        name: folder.name,
        color: folder.color,
      });
      folderCount++;
    }
  }

  // Import items
  for (const item of data.items) {
    if (item.deleted) continue;
    await createItem({
      type: item.type,
      title: item.title,
      content: item.content,
      url: item.url,
      reminderDate: item.reminderDate,
      reminderCompleted: item.reminderCompleted,
      tags: item.tags || [],
      pinned: item.pinned || false,
      color: item.color,
    });
    itemCount++;
  }

  return { items: itemCount, folders: folderCount };
}
