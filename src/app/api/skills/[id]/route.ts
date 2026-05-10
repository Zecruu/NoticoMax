import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBearerUser } from "@/lib/supabase/bearer-auth";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface SkillRow {
  id: string;
  user_id: string;
  tool: "claude" | "codex";
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  content: string;
  supporting_files: Array<{ filename: string; content: string }>;
  tags: string[];
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

function rowToWire(r: SkillRow) {
  return {
    skillId: r.id,
    userId: r.user_id,
    tool: r.tool,
    name: r.name,
    description: r.description,
    frontmatter: r.frontmatter,
    content: r.content,
    supportingFiles: r.supporting_files,
    tags: r.tags,
    isPublic: r.is_public,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function GET(request: NextRequest, ctx: RouteContext) {
  const auth = await requireBearerUser(request);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("claude_skills")
    .select("*")
    .eq("id", id)
    .or(`user_id.eq.${auth.userId},is_public.eq.true`)
    .maybeSingle();

  if (error) {
    console.error("[skills/:id GET] failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ skill: rowToWire(data as SkillRow) });
}

export async function PUT(request: NextRequest, ctx: RouteContext) {
  const auth = await requireBearerUser(request);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string") patch.description = body.description;
  if (body.frontmatter && typeof body.frontmatter === "object") patch.frontmatter = body.frontmatter;
  if (typeof body.content === "string") patch.content = body.content;
  if (Array.isArray(body.supportingFiles)) patch.supporting_files = body.supportingFiles;
  if (Array.isArray(body.tags)) patch.tags = body.tags.filter((t): t is string => typeof t === "string");
  if (body.isPublic !== undefined) patch.is_public = body.isPublic === true;
  if (body.tool === "claude" || body.tool === "codex") patch.tool = body.tool;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("claude_skills")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.userId)
    .select()
    .maybeSingle();

  if (error) {
    console.error("[skills/:id PUT] failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ skill: rowToWire(data as SkillRow) });
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  const auth = await requireBearerUser(request);
  if (auth.error) return auth.error;
  const { id } = await ctx.params;

  const admin = getSupabaseAdminClient();
  const { error, count } = await admin
    .from("claude_skills")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("user_id", auth.userId);

  if (error) {
    console.error("[skills/:id DELETE] failed:", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  if (!count) return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  return NextResponse.json({ success: true });
}
