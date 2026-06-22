import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAllowedAssistantUser } from "@/lib/ai/gate";
import {
  ALLOWED_TOOLS,
  executeToolCall,
  logToolAudit,
  validateToolCall,
} from "@/lib/ai/tools";

export const runtime = "nodejs";

/**
 * POST /api/assistant/tools — validate + execute one assistant tool.
 * Body: { name: AssistantToolName, args: object }
 *
 * This is the safe server-side write path for notes/URLs/reminders/alarms. The
 * user (or, later, the model via this same gate) proposes a tool; the server
 * validates against the allowlist, then executes scoped to the authenticated
 * user and logs an audit row. Passwords are intentionally not a tool here.
 *
 * GET returns the tool catalog for discovery.
 */
export async function GET(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;
  return NextResponse.json({ tools: ALLOWED_TOOLS });
}

export async function POST(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : "";
  const args = body.args ?? {};

  const admin = getSupabaseAdminClient();
  const validation = validateToolCall(name, args);
  if (!validation.ok) {
    await logToolAudit(admin, {
      userId: gate.userId,
      tool: name || "unknown",
      status: "rejected",
      args,
      error: validation.error,
    });
    return NextResponse.json({ error: validation.error, code: "invalid_tool" }, { status: 400 });
  }

  try {
    const result = await executeToolCall(admin, gate.userId, validation.call);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    console.error("[assistant tools] execution failed:", err);
    return NextResponse.json({ error: "Tool execution failed" }, { status: 500 });
  }
}
