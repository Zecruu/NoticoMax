import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import License from "@/models/License";

export async function POST(request: NextRequest) {
  try {
    const { sessionToken, licenseKey } = await request.json();

    if (!sessionToken || !licenseKey) {
      return NextResponse.json({ error: "Session token and license key are required" }, { status: 400 });
    }

    await dbConnect();

    const user = await User.findOne({ sessionTokens: sessionToken });
    if (!user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const trimmedKey = licenseKey.trim();

    // Check if the key exists in our database
    const license = await License.findOne({ licenseKey: trimmedKey });
    if (!license) {
      return NextResponse.json({ error: "Invalid product key" }, { status: 403 });
    }

    if (!license.active) {
      return NextResponse.json({ error: "This product key has been deactivated" }, { status: 403 });
    }

    // Link the email to the license
    if (!license.email) {
      license.email = user.email;
      license.activatedAt = new Date();
      await license.save();
    }

    // Link license to user account
    user.licenseKey = trimmedKey;
    await user.save();

    return NextResponse.json({
      success: true,
      licenseKey: trimmedKey,
      email: user.email,
    });
  } catch (error) {
    console.error("[auth/link-license] Error:", error);
    return NextResponse.json({ error: "Failed to link license" }, { status: 500 });
  }
}
