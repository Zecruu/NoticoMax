import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import SharedQuiz from "@/models/SharedQuiz";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  await dbConnect();
  const quiz = await SharedQuiz.findOne({ shareId: id });

  if (!quiz) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    name: quiz.name,
    questions: quiz.questions,
    createdAt: quiz.createdAt,
  });
}
