import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/mongodb";
import Item from "@/models/Item";
import { requireLicense } from "@/lib/license-auth";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireLicense(request);
  if (error) return error;

  try {
    await dbConnect();

    const { title, content, url, type } = await request.json();

    const item = await Item.create({
      clientId: uuidv4(),
      userId,
      type: type || (url ? "url" : "note"),
      title: title || "Untitled",
      content: content || "",
      url,
      tags: [],
      pinned: false,
      deleted: false,
    });

    return NextResponse.json({ success: true, clientId: item.clientId }, { status: 201 });
  } catch (error) {
    console.error("POST /api/items/clip error:", error);
    return NextResponse.json({ error: "Failed to save clip" }, { status: 500 });
  }
}
