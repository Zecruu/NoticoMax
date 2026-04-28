import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { isAdminAuthorized } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from("claude_resumes")
      .select("*")
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "No resumes yet" }, { status: 404 });

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
