import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import License from "@/models/License";
import { verifyGumroadLicense } from "@/lib/gumroad";

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

    // Verify with Gumroad
    const result = await verifyGumroadLicense(licenseKey.trim(), true);
    if (!result.success || !result.purchase) {
      return NextResponse.json({ error: result.message || "Invalid license key" }, { status: 403 });
    }

    if (result.purchase.refunded || result.purchase.chargebacked) {
      return NextResponse.json({ error: "This license has been revoked" }, { status: 403 });
    }

    // Save license to License collection
    await License.findOneAndUpdate(
      { licenseKey: licenseKey.trim() },
      {
        licenseKey: licenseKey.trim(),
        productId: result.purchase.product_id,
        purchaseEmail: result.purchase.email,
        gumroadPurchaseId: result.purchase.id,
        active: true,
        uses: result.purchase.uses,
        validatedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Link license to user account
    user.licenseKey = licenseKey.trim();
    await user.save();

    return NextResponse.json({
      success: true,
      licenseKey: licenseKey.trim(),
      email: result.purchase.email,
    });
  } catch (error) {
    console.error("[auth/link-license] Error:", error);
    return NextResponse.json({ error: "Failed to link license" }, { status: 500 });
  }
}
