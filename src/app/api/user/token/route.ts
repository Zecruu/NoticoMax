import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { requireAuth } from "@/lib/auth-utils";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export async function GET() {
  const { error, user } = await requireAuth();
  if (error) return error;

  await dbConnect();
  const dbUser = await User.findById(user!.id).select("apiToken");

  return NextResponse.json({ token: dbUser?.apiToken || null });
}

export async function POST() {
  const { error, user } = await requireAuth();
  if (error) return error;

  await dbConnect();
  const token = `ntk_${nanoid(32)}`;
  await User.findByIdAndUpdate(user!.id, { apiToken: token });

  return NextResponse.json({ token });
}

export async function DELETE() {
  const { error, user } = await requireAuth();
  if (error) return error;

  await dbConnect();
  await User.findByIdAndUpdate(user!.id, { $unset: { apiToken: 1 } });

  return NextResponse.json({ success: true });
}
