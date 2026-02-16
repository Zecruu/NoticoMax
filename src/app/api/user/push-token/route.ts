import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-utils";
import dbConnect from "@/lib/mongodb";
import PushToken from "@/models/PushToken";

export async function POST(request: NextRequest) {
  const { error, user } = await requireAuth();
  if (error) return error;

  const { token, platform } = await request.json();
  if (!token || !["ios", "android"].includes(platform)) {
    return NextResponse.json(
      { error: "Missing token or invalid platform" },
      { status: 400 }
    );
  }

  await dbConnect();
  await PushToken.findOneAndUpdate(
    { userId: user!.id, token },
    { userId: user!.id, token, platform, updatedAt: new Date() },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}
