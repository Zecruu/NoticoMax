import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Item from "@/models/Item";
import Folder from "@/models/Folder";
import { requirePro } from "@/lib/auth-utils";

interface SyncOperation {
  action: "create" | "update" | "delete";
  clientId: string;
  data?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  const { error, user } = await requirePro();
  if (error) return error;
  const userId = user!.id;

  try {
    await dbConnect();

    const { operations, folderOperations, lastSyncAt } = await request.json() as {
      operations: SyncOperation[];
      folderOperations?: SyncOperation[];
      lastSyncAt?: string;
    };

    const results: Record<string, unknown>[] = [];

    // Process folder operations first
    if (folderOperations) {
      for (const op of folderOperations) {
        try {
          if (op.action === "create") {
            const existing = await Folder.findOne({ clientId: op.clientId, userId });
            if (existing) {
              results.push({ clientId: op.clientId, entity: "folder", status: "exists", item: existing });
            } else {
              const folder = await Folder.create({ ...op.data, clientId: op.clientId, userId });
              results.push({ clientId: op.clientId, entity: "folder", status: "created", item: folder });
            }
          } else if (op.action === "update") {
            const folder = await Folder.findOneAndUpdate(
              { clientId: op.clientId, userId },
              op.data,
              { new: true, runValidators: true }
            );
            results.push({ clientId: op.clientId, entity: "folder", status: folder ? "updated" : "not_found", item: folder });
          } else if (op.action === "delete") {
            const folder = await Folder.findOneAndUpdate(
              { clientId: op.clientId, userId },
              { deleted: true },
              { new: true }
            );
            if (folder) {
              await Item.updateMany(
                { folderId: folder.clientId, userId, deleted: { $ne: true } },
                { deleted: true }
              );
            }
            results.push({ clientId: op.clientId, entity: "folder", status: folder ? "deleted" : "not_found" });
          }
        } catch (opError) {
          console.error(`Folder sync operation failed for ${op.clientId}:`, opError);
          results.push({ clientId: op.clientId, entity: "folder", status: "error", error: String(opError) });
        }
      }
    }

    // Process item operations
    for (const op of operations) {
      try {
        if (op.action === "create") {
          const existing = await Item.findOne({ clientId: op.clientId, userId });
          if (existing) {
            results.push({ clientId: op.clientId, status: "exists", item: existing });
          } else {
            const item = await Item.create({ ...op.data, clientId: op.clientId, userId });
            results.push({ clientId: op.clientId, status: "created", item });
          }
        } else if (op.action === "update") {
          const item = await Item.findOneAndUpdate(
            { clientId: op.clientId, userId },
            op.data,
            { new: true, runValidators: true }
          );
          results.push({ clientId: op.clientId, status: item ? "updated" : "not_found", item });
        } else if (op.action === "delete") {
          const item = await Item.findOneAndUpdate(
            { clientId: op.clientId, userId },
            { deleted: true },
            { new: true }
          );
          results.push({ clientId: op.clientId, status: item ? "deleted" : "not_found" });
        }
      } catch (opError) {
        console.error(`Sync operation failed for ${op.clientId}:`, opError);
        results.push({ clientId: op.clientId, status: "error", error: String(opError) });
      }
    }

    // Return all items and folders updated since last sync (scoped to user)
    const query: Record<string, unknown> = { userId };
    if (lastSyncAt) {
      query.updatedAt = { $gte: new Date(lastSyncAt) };
    }
    const serverItems = await Item.find(query).lean();
    const serverFolders = await Folder.find(query).lean();

    return NextResponse.json({
      results,
      serverItems,
      serverFolders,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("POST /api/items/sync error:", error);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
