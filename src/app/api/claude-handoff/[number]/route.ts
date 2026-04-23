import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ClaudeResume from "@/models/ClaudeResume";
import { isAdminAuthorized } from "@/lib/admin-auth";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ number: string }>;
}

/**
 * GET /api/claude-handoff/:number
 */
export async function GET(request: NextRequest, { params }: Params) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { number } = await params;
    const n = parseInt(number, 10);
    if (isNaN(n)) {
      return NextResponse.json({ error: "Invalid number" }, { status: 400 });
    }

    await dbConnect();
    const resume = await ClaudeResume.findOne({ number: n });
    if (!resume) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      number: resume.number,
      author: resume.author,
      content: resume.content,
      tags: resume.tags,
      createdAt: resume.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[claude-handoff/:number GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/claude-handoff/:number
 */
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { number } = await params;
    const n = parseInt(number, 10);
    if (isNaN(n)) {
      return NextResponse.json({ error: "Invalid number" }, { status: 400 });
    }

    await dbConnect();
    const result = await ClaudeResume.deleteOne({ number: n });

    return NextResponse.json({ deletedCount: result.deletedCount ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[claude-handoff/:number DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
