import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import License from "@/models/License";
import { generateProductKey } from "@/lib/gumroad";

export async function POST(request: NextRequest) {
  // Protect with admin secret
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { count = 1 } = await request.json().catch(() => ({ count: 1 }));
    const numKeys = Math.min(Math.max(1, Number(count)), 100); // 1-100 keys at a time

    await dbConnect();

    const keys: string[] = [];
    for (let i = 0; i < numKeys; i++) {
      const licenseKey = generateProductKey();
      await License.create({ licenseKey, active: true });
      keys.push(licenseKey);
    }

    return NextResponse.json({ success: true, keys });
  } catch (err) {
    console.error("[admin/generate-keys] Error:", err);
    return NextResponse.json({ error: "Failed to generate keys" }, { status: 500 });
  }
}
