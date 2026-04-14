import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireSession } from "@/lib/session-auth";
import dbConnect from "@/lib/mongodb";
import ClaudeSkill from "@/models/ClaudeSkill";

// GET /api/skills - List the user's skills (or public skills)
export async function GET(request: NextRequest) {
  const { error, userId } = await requireSession(request);
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search");
  const tag = searchParams.get("tag");
  const includePublic = searchParams.get("public") === "true";

  await dbConnect();

  // Build query: user's own skills + optionally public skills from others
  const conditions: Record<string, unknown>[] = [{ userId, deleted: false }];
  if (includePublic) {
    conditions.push({ isPublic: true, deleted: false });
  }

  const query: Record<string, unknown> = { $or: conditions };

  if (search) {
    query.$text = { $search: search };
  }
  if (tag) {
    query.tags = tag;
  }

  const skills = await ClaudeSkill.find(query)
    .sort({ updatedAt: -1 })
    .lean();

  return NextResponse.json({ skills });
}

// POST /api/skills - Create or upsert a skill
export async function POST(request: NextRequest) {
  const { error, userId } = await requireSession(request);
  if (error) return error;

  const body = await request.json();
  const { name, description, frontmatter, content, supportingFiles, tags, isPublic } = body;

  if (!name || !content) {
    return NextResponse.json(
      { error: "name and content are required" },
      { status: 400 }
    );
  }

  await dbConnect();

  // Upsert: if a skill with this name already exists for this user, update it
  const existing = await ClaudeSkill.findOne({ userId, name, deleted: false });

  if (existing) {
    existing.description = description ?? existing.description;
    existing.frontmatter = frontmatter ?? existing.frontmatter;
    existing.content = content;
    existing.supportingFiles = supportingFiles ?? existing.supportingFiles;
    existing.tags = tags ?? existing.tags;
    if (isPublic !== undefined) existing.isPublic = isPublic;
    await existing.save();

    return NextResponse.json({ skill: existing.toObject(), updated: true });
  }

  const skill = await ClaudeSkill.create({
    skillId: nanoid(12),
    userId,
    name,
    description: description ?? "",
    frontmatter: frontmatter ?? {},
    content,
    supportingFiles: supportingFiles ?? [],
    tags: tags ?? [],
    isPublic: isPublic ?? false,
  });

  return NextResponse.json({ skill: skill.toObject(), created: true }, { status: 201 });
}
