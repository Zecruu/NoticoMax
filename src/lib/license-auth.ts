import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/mongodb";
import License from "@/models/License";

export function licenseKeyToUserId(licenseKey: string): string {
  return crypto.createHash("sha256").update(licenseKey).digest("hex").slice(0, 24);
}

export async function requireLicense(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ error: "License key required" }, { status: 401 }),
      userId: null as string | null,
      licenseKey: null as string | null,
    };
  }

  const licenseKey = authHeader.slice(7).trim();
  if (!licenseKey) {
    return {
      error: NextResponse.json({ error: "License key required" }, { status: 401 }),
      userId: null as string | null,
      licenseKey: null as string | null,
    };
  }

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB connection timed out")), 5000)
    );
    await Promise.race([dbConnect(), timeout]);
  } catch (err) {
    console.error("[license-auth] DB connect error:", (err as Error).message);
    return {
      error: NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 }),
      userId: null as string | null,
      licenseKey: null as string | null,
    };
  }

  const license = await License.findOne({ licenseKey });

  if (!license) {
    return {
      error: NextResponse.json({ error: "Invalid license key" }, { status: 403 }),
      userId: null as string | null,
      licenseKey: null as string | null,
    };
  }

  if (!license.active) {
    return {
      error: NextResponse.json({ error: "License has been deactivated" }, { status: 403 }),
      userId: null as string | null,
      licenseKey: null as string | null,
    };
  }

  const userId = licenseKeyToUserId(licenseKey);
  return { error: null, userId, licenseKey };
}
