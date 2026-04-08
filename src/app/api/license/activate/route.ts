import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import License from "@/models/License";
import { licenseKeyToUserId } from "@/lib/license-auth";

export async function POST(request: NextRequest) {
  const { licenseKey } = await request.json();
  if (!licenseKey || typeof licenseKey !== "string") {
    return NextResponse.json({ error: "Product key is required" }, { status: 400 });
  }

  const trimmedKey = licenseKey.trim();

  try {
    await dbConnect();

    const license = await License.findOne({ licenseKey: trimmedKey });
    if (!license) {
      return NextResponse.json({ error: "Invalid product key" }, { status: 403 });
    }

    if (!license.active) {
      return NextResponse.json({ error: "This product key has been deactivated" }, { status: 403 });
    }

    if (!license.activatedAt) {
      license.activatedAt = new Date();
      await license.save();
    }

    return NextResponse.json({
      success: true,
      email: license.email || "",
      userId: licenseKeyToUserId(trimmedKey),
    });
  } catch (err) {
    console.error("[license/activate] Error:", err);
    return NextResponse.json({ error: "Failed to validate product key" }, { status: 500 });
  }
}
