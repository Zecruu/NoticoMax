import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import Folder from "@/models/Folder";
import { requireLicense } from "@/lib/license-auth";

export async function GET(request: NextRequest) {
  const { error, userId } = await requireLicense(request);
  if (error) return error;

  try {
    await dbConnect();
    const folders = await Folder.find({ userId, deleted: { $ne: true } })
      .sort({ name: 1 })
      .lean();
    return NextResponse.json(folders);
  } catch (error) {
    console.error("GET /api/folders error:", error);
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { error, userId } = await requireLicense(request);
  if (error) return error;

  try {
    await dbConnect();
    const body = await request.json();

    const existing = await Folder.findOne({ clientId: body.clientId, userId });
    if (existing) {
      return NextResponse.json(existing, { status: 200 });
    }

    const folder = await Folder.create({ ...body, userId });
    return NextResponse.json(folder, { status: 201 });
  } catch (error) {
    console.error("POST /api/folders error:", error);
    return NextResponse.json({ error: "Failed to create folder" }, { status: 500 });
  }
}
