import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Folder from "@/models/Folder";
import Item from "@/models/Item";
import { requirePro } from "@/lib/auth-utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requirePro();
  if (error) return error;

  try {
    await dbConnect();
    const { id } = await params;
    const body = await request.json();

    const folder = await Folder.findOneAndUpdate(
      { _id: id, userId: user!.id },
      body,
      { new: true, runValidators: true }
    ).lean();

    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    return NextResponse.json(folder);
  } catch (error) {
    console.error("PUT /api/folders/[id] error:", error);
    return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, user } = await requirePro();
  if (error) return error;
  const userId = user!.id;

  try {
    await dbConnect();
    const { id } = await params;

    const folder = await Folder.findOne({ _id: id, userId });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    // Cascade: soft-delete all items in this folder
    await Item.updateMany(
      { folderId: folder.clientId, userId, deleted: { $ne: true } },
      { deleted: true }
    );

    folder.deleted = true;
    await folder.save();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/folders/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
  }
}
