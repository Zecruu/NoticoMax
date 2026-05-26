import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { requireBearerScope } from "@/lib/supabase/bearer-auth";

export const runtime = "nodejs";

const DEFAULT_PROJECT = "default";

interface ItemRow {
  client_id: string;
  user_id: string;
  type: string;
  title: string;
  content: string;
  tags: string[];
  deleted: boolean;
  created_at: string;
  updated_at: string;
}

function rowToWire(r: ItemRow) {
  return {
    clientId: r.client_id,
    name: r.title,
    value: r.content,
    project: r.tags[0] ?? DEFAULT_PROJECT,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * GET /api/envvars — list the caller's environment variables.
 *
 * Query params:
 *   - project: restrict to a single project bucket (first tag on the item)
 *   - search:  case-insensitive substring on the variable name
 */
export async function GET(request: NextRequest) {
  const auth = await requireBearerScope(request, "envvars");
  if (auth.error) return auth.error;

  const { searchParams } = new URL(request.url);
  const project = searchParams.get("project");
  const search = searchParams.get("search");

  const admin = getSupabaseAdminClient();
  let query = admin
    .from("items")
    .select("client_id, user_id, type, title, content, tags, deleted, created_at, updated_at")
    .eq("user_id", auth.userId)
    .eq("type", "envvar")
    .eq("deleted", false)
    .order("title", { ascending: true });

  if (project) query = query.contains("tags", [project]);
  if (search) {
    const safe = search.replace(/[%_]/g, "\\$&");
    query = query.ilike("title", `%${safe}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[envvars GET] query failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ envvars: (data ?? []).map((r) => rowToWire(r as ItemRow)) });
}

/**
 * POST /api/envvars — upsert by (user_id, name, project).
 *
 * Body: { name, value, project? }
 *   - name: variable identifier, e.g. AWS_ACCESS_KEY_ID
 *   - value: the secret payload (stored as-is)
 *   - project: optional grouping tag (defaults to "default")
 *
 * If a row with the same (user, name, project) already exists we update its
 * value instead of creating a duplicate — matches the web Settings UX where
 * editing a var rewrites in place.
 */
export async function POST(request: NextRequest) {
  const auth = await requireBearerScope(request, "envvars");
  if (auth.error) return auth.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const value = typeof body.value === "string" ? body.value : "";
  const project =
    typeof body.project === "string" && body.project.trim()
      ? body.project.trim()
      : DEFAULT_PROJECT;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "value is required" }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const now = new Date().toISOString();

  // Manual upsert — `items` has no composite unique on (user, type, title, tags)
  // so we can't lean on onConflict. Look up by (user, type, title, tag=project)
  // and either update or insert.
  const { data: existing, error: lookupErr } = await admin
    .from("items")
    .select("client_id")
    .eq("user_id", auth.userId)
    .eq("type", "envvar")
    .eq("title", name)
    .contains("tags", [project])
    .eq("deleted", false)
    .maybeSingle();

  if (lookupErr) {
    console.error("[envvars POST] lookup failed:", lookupErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  if (existing) {
    const { data, error } = await admin
      .from("items")
      .update({ content: value, updated_at: now })
      .eq("client_id", existing.client_id)
      .select("client_id, user_id, type, title, content, tags, deleted, created_at, updated_at")
      .single();
    if (error) {
      console.error("[envvars POST] update failed:", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
    return NextResponse.json({ envvar: rowToWire(data as ItemRow), created: false });
  }

  const { data, error } = await admin
    .from("items")
    .insert({
      user_id: auth.userId,
      type: "envvar",
      title: name,
      content: value,
      tags: [project],
      pinned: false,
      deleted: false,
    })
    .select("client_id, user_id, type, title, content, tags, deleted, created_at, updated_at")
    .single();

  if (error) {
    console.error("[envvars POST] insert failed:", error);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }
  return NextResponse.json({ envvar: rowToWire(data as ItemRow), created: true });
}
