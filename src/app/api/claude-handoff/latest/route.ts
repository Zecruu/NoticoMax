import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ClaudeResume from "@/models/ClaudeResume";
import { isAdminAuthorized } from "@/lib/admin-auth";

export const runtime = "nodejs";

/**
 * GET /api/claude-handoff/latest
 * Returns the most recent resume, or 404 if none exist.
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();
    const resume = await ClaudeResume.findOne().sort({ number: -1 });

    if (!resume) {
      return NextResponse.json({ error: "No resumes yet" }, { status: 404 });
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
    console.error("[claude-handoff/latest]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
