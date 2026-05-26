import { NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { ALL_SCOPES, type Scope } from "@/lib/supabase/bearer-auth";

export const runtime = "nodejs";

async function getUserId() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  return data.claims.sub as string;
}

// GET /api/claude-tokens — list the caller's tokens (no full token, just last4)
export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("claude_api_tokens")
    .select("id, name, last4, scopes, last_used_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[claude-tokens GET] failed:", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ tokens: data ?? [] });
}

// POST /api/claude-tokens — generate a new token. Returns the full token ONCE.
// Body: { name?, scopes?: ('skills' | 'envvars')[] }. Default scopes: ['skills'].
export async function POST(request: NextRequest) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: unknown; scopes?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — defaults below
  }
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 80)
      : "Claude Code";

  const requestedScopes = Array.isArray(body.scopes)
    ? body.scopes.filter((s): s is Scope => ALL_SCOPES.includes(s as Scope))
    : [];
  const scopes: Scope[] = requestedScopes.length > 0 ? Array.from(new Set(requestedScopes)) : ["skills"];

  const token = "sk_nm_" + randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const last4 = token.slice(-4);

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("claude_api_tokens")
    .insert({ user_id: userId, name, token_hash: tokenHash, last4, scopes })
    .select("id, name, last4, scopes, created_at")
    .single();

  if (error) {
    console.error("[claude-tokens POST] failed:", error);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
  return NextResponse.json({ token, record: data });
}
