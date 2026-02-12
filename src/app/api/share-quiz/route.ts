import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAuth } from "@/lib/auth-utils";
import dbConnect from "@/lib/mongodb";
import SharedQuiz from "@/models/SharedQuiz";

export async function POST(request: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { clientId, name, questions } = await request.json();
  if (!clientId || !name || !questions?.length) {
    return NextResponse.json({ error: "clientId, name, and questions required" }, { status: 400 });
  }

  await dbConnect();

  // Check if already shared
  const existing = await SharedQuiz.findOne({ quizClientId: clientId, userId: user!.id });
  if (existing) {
    return NextResponse.json({ shareId: existing.shareId });
  }

  const shareId = nanoid(12);
  await SharedQuiz.create({
    shareId,
    quizClientId: clientId,
    userId: user!.id,
    name,
    questions,
  });

  return NextResponse.json({ shareId });
}

export async function DELETE(request: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { shareId } = await request.json();
  if (!shareId) {
    return NextResponse.json({ error: "shareId required" }, { status: 400 });
  }

  await dbConnect();
  await SharedQuiz.deleteOne({ shareId, userId: user!.id });

  return NextResponse.json({ success: true });
}
