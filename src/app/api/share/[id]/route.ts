import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SharedNote from "@/models/SharedNote";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await dbConnect();
  const note = await SharedNote.findOne({ shareId: id });

  if (!note) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    title: note.title,
    content: note.content,
    type: note.type,
    url: note.url,
    tags: note.tags,
    createdAt: note.createdAt,
  });
}
