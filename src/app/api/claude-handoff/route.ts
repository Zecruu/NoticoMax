import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import ClaudeResume from "@/models/ClaudeResume";
import { nextSequence } from "@/models/Counter";
import { isAdminAuthorized } from "@/lib/admin-auth";

export const runtime = "nodejs";

const COUNTER_NAME = "claudeResume";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * POST /api/claude-handoff
 * Body: { author: string, content: string, tags?: string[] }
 * Returns: { number, author, content, tags, createdAt }
 */
export async function POST(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    const body = await request.json();
    const { author, content, tags } = body as {
      author?: string;
      content?: string;
      tags?: string[];
    };

    if (!author || !content) {
      return NextResponse.json(
        { error: "author and content are required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const number = await nextSequence(COUNTER_NAME);

    const resume = await ClaudeResume.create({
      number,
      author: author.trim(),
      content,
      tags: Array.isArray(tags) ? tags : [],
    });

    return NextResponse.json({
      number: resume.number,
      author: resume.author,
      content: resume.content,
      tags: resume.tags,
      createdAt: resume.createdAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[claude-handoff POST]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/claude-handoff
 *   ?since=<number>  — return resumes with number > since (ascending)
 *   ?limit=<n>       — cap results (default 20, max 100)
 * Default (no params): return the last 20 resumes (descending).
 */
export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    await dbConnect();

    const url = new URL(request.url);
    const sinceParam = url.searchParams.get("since");
    const limitParam = url.searchParams.get("limit");

    const limit = Math.min(
      Math.max(parseInt(limitParam || "20", 10) || 20, 1),
      100
    );

    const query = sinceParam
      ? { number: { $gt: parseInt(sinceParam, 10) } }
      : {};
    const sort: Record<string, 1 | -1> = sinceParam
      ? { number: 1 }
      : { number: -1 };

    const resumes = await ClaudeResume.find(query).sort(sort).limit(limit);

    return NextResponse.json({
      count: resumes.length,
      resumes: resumes.map((r) => ({
        number: r.number,
        author: r.author,
        content: r.content,
        tags: r.tags,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[claude-handoff GET]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/claude-handoff
 *   ?before=<number>     — delete all resumes with number < before
 *   ?keep_last=<n>       — keep only the last N; delete the rest
 */
export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    await dbConnect();

    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const keepLast = url.searchParams.get("keep_last");

    if (!before && !keepLast) {
      return NextResponse.json(
        { error: "Provide ?before=<n> or ?keep_last=<n>" },
        { status: 400 }
      );
    }

    let deletedCount = 0;

    if (before) {
      const n = parseInt(before, 10);
      if (isNaN(n)) {
        return NextResponse.json({ error: "before must be a number" }, { status: 400 });
      }
      const result = await ClaudeResume.deleteMany({ number: { $lt: n } });
      deletedCount = result.deletedCount ?? 0;
    } else if (keepLast) {
      const n = parseInt(keepLast, 10);
      if (isNaN(n) || n < 0) {
        return NextResponse.json({ error: "keep_last must be >= 0" }, { status: 400 });
      }
      // Find the Nth-newest resume; delete everything older.
      const cutoff = await ClaudeResume.find()
        .sort({ number: -1 })
        .skip(n)
        .limit(1);
      if (cutoff.length > 0) {
        const result = await ClaudeResume.deleteMany({
          number: { $lte: cutoff[0].number },
        });
        deletedCount = result.deletedCount ?? 0;
      }
    }

    return NextResponse.json({ deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[claude-handoff DELETE]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
