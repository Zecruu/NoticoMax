import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import License from "@/models/License";
import { computeEntitlements } from "@/lib/entitlements";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken } = await request.json();

    if (!sessionToken) {
      return NextResponse.json({ error: "Session token required" }, { status: 401 });
    }

    await dbConnect();

    const user = await User.findOne({ sessionTokens: sessionToken });
    if (!user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const license = user.licenseKey
      ? await License.findOne({ licenseKey: user.licenseKey })
      : null;

    const entitlements = computeEntitlements(user, license);

    return NextResponse.json({
      success: true,
      email: user.email,
      licenseKey: user.licenseKey || null,
      entitlements,
    });
  } catch (error) {
    console.error("[auth/verify] Error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
