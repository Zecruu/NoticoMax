import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import { computeEntitlements } from "@/lib/entitlements";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    await dbConnect();

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
    }

    const user = new User({ email: email.toLowerCase().trim() });
    user.setPassword(password);
    const sessionToken = user.addSessionToken();
    await user.save();

    const entitlements = computeEntitlements(user, null);

    return NextResponse.json({
      success: true,
      email: user.email,
      licenseKey: user.licenseKey || null,
      sessionToken,
      entitlements,
    });
  } catch (error) {
    console.error("[auth/register] Error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
