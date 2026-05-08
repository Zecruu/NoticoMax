import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminAuthorized } from "@/lib/admin-auth";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ number: string }>;
}

export async function GET(request: NextRequest, { params }: Params) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { number } = await params;
    const n = parseInt(number, 10);
    if (isNaN(n)) return NextResponse.json({ error: "Invalid number" }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("claude_resumes")
      .select("*")
      .eq("number", n)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

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

export async function DELETE(request: NextRequest, { params }: Params) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { number } = await params;
    const n = parseInt(number, 10);
    if (isNaN(n)) return NextResponse.json({ error: "Invalid number" }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { count, error } = await admin
      .from("claude_resumes")
      .delete({ count: "exact" })
      .eq("number", n);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deletedCount: count ?? 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
