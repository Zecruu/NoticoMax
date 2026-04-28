import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminAuthorized } from "@/lib/admin-auth";

export const runtime = "nodejs";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

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
      return NextResponse.json({ error: "author and content are required" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("claude_resumes")
      .insert({
        author: author.trim(),
        content,
        tags: Array.isArray(tags) ? tags : [],
      })
      .select()
      .single();

    if (error) {
      console.error("[claude-handoff POST]", error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      number: data.number,
      author: data.author,
      content: data.content,
      tags: data.tags,
      createdAt: data.created_at,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const sinceParam = url.searchParams.get("since");
    const limitParam = url.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 100);

    const admin = getSupabaseAdminClient();
    let query = admin.from("claude_resumes").select("*").limit(limit);

    if (sinceParam) {
      query = query.gt("number", parseInt(sinceParam, 10)).order("number", { ascending: true });
    } else {
      query = query.order("number", { ascending: false });
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      count: data.length,
      resumes: data.map((r) => ({
        number: r.number,
        author: r.author,
        content: r.content,
        tags: r.tags,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isAdminAuthorized(request)) return unauthorized();

  try {
    const url = new URL(request.url);
    const before = url.searchParams.get("before");
    const keepLast = url.searchParams.get("keep_last");

    if (!before && !keepLast) {
      return NextResponse.json({ error: "Provide ?before=<n> or ?keep_last=<n>" }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    let deletedCount = 0;

    if (before) {
      const n = parseInt(before, 10);
      if (isNaN(n)) return NextResponse.json({ error: "before must be a number" }, { status: 400 });
      const { count } = await admin
        .from("claude_resumes")
        .delete({ count: "exact" })
        .lt("number", n);
      deletedCount = count ?? 0;
    } else if (keepLast) {
      const n = parseInt(keepLast, 10);
      if (isNaN(n) || n < 0) return NextResponse.json({ error: "keep_last must be >= 0" }, { status: 400 });

      const { data: cutoff } = await admin
        .from("claude_resumes")
        .select("number")
        .order("number", { ascending: false })
        .range(n, n);

      if (cutoff && cutoff.length > 0) {
        const { count } = await admin
          .from("claude_resumes")
          .delete({ count: "exact" })
          .lte("number", cutoff[0].number);
        deletedCount = count ?? 0;
      }
    }

    return NextResponse.json({ deletedCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
