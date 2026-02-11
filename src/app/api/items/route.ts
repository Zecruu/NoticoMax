import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Item from "@/models/Item";
import { requirePro } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  const { error, user } = await requirePro();
  if (error) return error;
  const userId = user!.id;

  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const search = searchParams.get("search");
    const since = searchParams.get("since");
    const folderId = searchParams.get("folderId");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query: any = { userId, deleted: { $ne: true } };

    if (type && type !== "all") {
      query.type = type;
    }

    if (search) {
      query.$text = { $search: search };
    }

    if (folderId) {
      query.folderId = folderId;
    }

    if (since) {
      query.updatedAt = { $gte: new Date(since) };
    }

    const items = await Item.find(query).sort({ pinned: -1, updatedAt: -1 }).lean();

    return NextResponse.json(items);
  } catch (error) {
    console.error("GET /api/items error:", error);
    return NextResponse.json({ error: "Failed to fetch items" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, user } = await requirePro();
  if (error) return error;
  const userId = user!.id;

  try {
    await dbConnect();

    const body = await request.json();

    const existing = await Item.findOne({ clientId: body.clientId, userId });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const item = await Item.create({ ...body, userId });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("POST /api/items error:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}
