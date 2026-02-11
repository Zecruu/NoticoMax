import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAuth } from "@/lib/auth-utils";
import dbConnect from "@/lib/mongodb";
import Item from "@/models/Item";
import SharedNote from "@/models/SharedNote";

export async function POST(request: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { clientId } = await request.json();
  if (!clientId) {
    return NextResponse.json({ error: "clientId required" }, { status: 400 });
  }

  await dbConnect();

  // Check if already shared
  const existing = await SharedNote.findOne({ itemClientId: clientId, userId: user!.id });
  if (existing) {
    return NextResponse.json({ shareId: existing.shareId });
  }

  // Look up the item from MongoDB
  const item = await Item.findOne({ clientId, userId: user!.id });
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const shareId = nanoid(12);
  await SharedNote.create({
    shareId,
    itemClientId: clientId,
    userId: user!.id,
    title: item.title,
    content: item.content,
    type: item.type,
    url: item.url,
    tags: item.tags,
  });

  return NextResponse.json({ shareId });
}

export async function DELETE(request: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { shareId } = await request.json();
  if (!shareId) {
    return NextResponse.json({ error: "shareId required" }, { status: 400 });
  }

  await dbConnect();
  await SharedNote.deleteOne({ shareId, userId: user!.id });

  return NextResponse.json({ success: true });
}
