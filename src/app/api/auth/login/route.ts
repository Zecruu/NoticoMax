import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import License from "@/models/License";
import { computeEntitlements } from "@/lib/entitlements";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    await dbConnect();

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.verifyPassword(password)) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const sessionToken = user.addSessionToken();
    await user.save();

    const license = user.licenseKey
      ? await License.findOne({ licenseKey: user.licenseKey })
      : null;
    const entitlements = computeEntitlements(user, license);

    return NextResponse.json({
      success: true,
      email: user.email,
      licenseKey: user.licenseKey || null,
      sessionToken,
      entitlements,
    });
  } catch (error) {
    console.error("[auth/login] Error:", error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
