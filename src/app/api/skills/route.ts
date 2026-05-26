import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBearerScope } from "@/lib/supabase/bearer-auth";

export const runtime = "nodejs";

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

/**
 * GET /api/skills — list the caller's skills.
 *
 * Query params:
 *   - search:  case-insensitive substring match on name + description
 *   - tag:     restrict to skills containing this tag
 *   - tool:    "claude" | "codex" (omit for both)
 *   - public=true: also include public skills from other users
 */
export async function GET(request: NextRequest) {
  const auth = await requireBearerScope(request, "skills");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const tag = searchParams.get("tag");
  const includePublic = searchParams.get("public") === "true";
  const toolParam = searchParams.get("tool");
  const tool = toolParam === "claude" || toolParam === "codex" ? toolParam : null;

  const admin = getSupabaseAdminClient();
  let query = admin.from("claude_skills").select("*").order("updated_at", { ascending: false });

  if (includePublic) {
    query = query.or(`user_id.eq.${auth.userId},is_public.eq.true`);
  } else {
    query = query.eq("user_id", auth.userId);
  }
  if (tool) query = query.eq("tool", tool);
  if (tag) query = query.contains("tags", [tag]);
  if (search) {
    const safe = search.replace(/[%_]/g, "\\$&");
    query = query.or(`name.ilike.%${safe}%,description.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[skills GET] query failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ skills: (data ?? []).map(rowToWire) });
}

/** POST /api/skills — upsert by (user_id, tool, name). */
export async function POST(request: NextRequest) {
  const auth = await requireBearerScope(request, "skills");
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const content = typeof body.content === "string" ? body.content : "";
  if (!name || !content) {
    return NextResponse.json({ error: "name and content are required" }, { status: 400 });
  }
  const tool: "claude" | "codex" = body.tool === "codex" ? "codex" : "claude";

  const row = {
    user_id: auth.userId,
    tool,
    name,
    description: typeof body.description === "string" ? body.description : "",
    frontmatter: body.frontmatter && typeof body.frontmatter === "object" ? body.frontmatter : {},
    content,
    supporting_files: Array.isArray(body.supportingFiles) ? body.supportingFiles : [],
    tags: Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string") : [],
    is_public: body.isPublic === true,
  };

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("claude_skills")
    .upsert(row, { onConflict: "user_id,tool,name" })
    .select()
    .single();

  if (error) {
    console.error("[skills POST] upsert failed:", error);
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }

  return NextResponse.json({ skill: rowToWire(data as SkillRow) });
}
