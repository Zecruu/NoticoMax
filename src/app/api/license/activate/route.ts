import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import License from "@/models/License";
import { verifyGumroadLicense } from "@/lib/gumroad";
import { licenseKeyToUserId } from "@/lib/license-auth";

export async function POST(request: NextRequest) {
  const { licenseKey } = await request.json();
  if (!licenseKey || typeof licenseKey !== "string") {
    return NextResponse.json({ error: "License key is required" }, { status: 400 });
  }

  const trimmedKey = licenseKey.trim();

  try {
    console.log("[license/activate] Verifying key:", trimmedKey.slice(0, 8) + "...", "Product ID:", process.env.GUMROAD_PRODUCT_ID);
    const result = await verifyGumroadLicense(trimmedKey, true);
    console.log("[license/activate] Gumroad response:", JSON.stringify(result));

    if (!result.success || !result.purchase) {
      return NextResponse.json(
        { error: result.message || "Invalid license key" },
        { status: 403 }
      );
    }

    if (result.purchase.refunded || result.purchase.chargebacked) {
      return NextResponse.json({ error: "This license has been revoked" }, { status: 403 });
    }

    await dbConnect();

    await License.findOneAndUpdate(
      { licenseKey: trimmedKey },
      {
        licenseKey: trimmedKey,
        productId: result.purchase.product_id,
        purchaseEmail: result.purchase.email,
        gumroadPurchaseId: result.purchase.id,
        active: true,
        uses: result.purchase.uses,
        validatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      success: true,
      email: result.purchase.email,
      userId: licenseKeyToUserId(trimmedKey),
    });
  } catch (err) {
    console.error("[license/activate] Error:", err);
    return NextResponse.json({ error: "Failed to validate license" }, { status: 500 });
  }
}
