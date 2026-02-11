import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import dbConnect from "@/lib/mongodb";
import Item from "@/models/Item";
import User from "@/models/User";

export async function POST(request: NextRequest) {
  // Bearer token auth for extension
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);

  await dbConnect();

  // Find user by API token (stored in user profile)
  const user = await User.findOne({ apiToken: token });
  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  try {
    const { title, content, url, type } = await request.json();

    const item = await Item.create({
      clientId: uuidv4(),
      userId: user._id.toString(),
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
