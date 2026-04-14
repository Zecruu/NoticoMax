import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/session-auth";
import dbConnect from "@/lib/mongodb";
import ClaudeSkill from "@/models/ClaudeSkill";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/skills/:id - Get a single skill by skillId
export async function GET(request: NextRequest, context: RouteContext) {
  const { error, userId } = await requireSession(request);
  if (error) return error;

  const { id } = await context.params;

  await dbConnect();

  const skill = await ClaudeSkill.findOne({
    skillId: id,
    deleted: false,
    $or: [{ userId }, { isPublic: true }],
  }).lean();

  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  return NextResponse.json({ skill });
}

// PUT /api/skills/:id - Update a skill
export async function PUT(request: NextRequest, context: RouteContext) {
  const { error, userId } = await requireSession(request);
  if (error) return error;

  const { id } = await context.params;
  const body = await request.json();

  await dbConnect();

  const skill = await ClaudeSkill.findOne({ skillId: id, userId, deleted: false });
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  const allowedFields = [
    "name",
    "description",
    "frontmatter",
    "content",
    "supportingFiles",
    "tags",
    "isPublic",
  ] as const;

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      (skill as unknown as Record<string, unknown>)[field] = body[field];
    }
  }

  await skill.save();
  return NextResponse.json({ skill: skill.toObject() });
}

// DELETE /api/skills/:id - Soft-delete a skill
export async function DELETE(request: NextRequest, context: RouteContext) {
  const { error, userId } = await requireSession(request);
  if (error) return error;

  const { id } = await context.params;

  await dbConnect();

  const skill = await ClaudeSkill.findOne({ skillId: id, userId, deleted: false });
  if (!skill) {
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  }

  skill.deleted = true;
  skill.deletedAt = new Date();
  await skill.save();

  return NextResponse.json({ success: true });
}
