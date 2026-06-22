import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveAllowedAssistantUser } from "@/lib/ai/gate";
import {
  addMemory,
  deleteMemory,
  listMemories,
  type MemoryType,
} from "@/lib/ai/memory";

export const runtime = "nodejs";

const TYPES: MemoryType[] = ["preference", "instruction", "do", "dont", "fact", "style"];

/** GET /api/assistant/memory — list the caller's memories. */
export async function GET(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  const admin = getSupabaseAdminClient();
  const memories = await listMemories(admin, gate.userId);
  return NextResponse.json({ memories });
}

/** POST /api/assistant/memory — add an explicit memory. Rejects secrets. */
export async function POST(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content : "";
  if (!content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }
  const type =
    typeof body.type === "string" && TYPES.includes(body.type as MemoryType)
      ? (body.type as MemoryType)
      : "preference";

  const admin = getSupabaseAdminClient();
  const result = await addMemory(admin, gate.userId, {
    type,
    content,
    source: "user_explicit",
  });

  if ("rejected" in result) {
    const msg =
      result.rejected === "secret"
        ? "That looks like a secret — Notico won't store passwords or sensitive values."
        : result.rejected === "too_long"
          ? "That memory is too long."
          : "That memory is empty.";
    return NextResponse.json({ error: msg, rejected: result.rejected }, { status: 422 });
  }

  return NextResponse.json({ memory: result });
}

/** DELETE /api/assistant/memory?id=... — remove a memory the user owns. */
export async function DELETE(request: NextRequest) {
  const gate = await resolveAllowedAssistantUser(request);
  if (gate.error) return gate.error;

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const ok = await deleteMemory(admin, gate.userId, id);
  if (!ok) return NextResponse.json({ error: "Couldn't delete that memory" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
