import { NextRequest, NextResponse } from "next/server";
import { requireLicense } from "@/lib/license-auth";
import dbConnect from "@/lib/mongodb";
import PushToken from "@/models/PushToken";

export async function POST(request: NextRequest) {
  const { error, userId } = await requireLicense(request);
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
    { userId, token },
    { userId, token, platform, updatedAt: new Date() },
    { upsert: true }
  );

  return NextResponse.json({ success: true });
}
