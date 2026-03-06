import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/mongodb";
import License from "@/models/License";
import { verifyGumroadLicense } from "@/lib/gumroad";

const REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

  await dbConnect();

  let license = await License.findOne({ licenseKey });

  const needsRevalidation =
    !license ||
    !license.active ||
    Date.now() - license.validatedAt.getTime() > REVALIDATION_INTERVAL_MS;

  if (needsRevalidation) {
    try {
      const result = await verifyGumroadLicense(licenseKey);

      if (!result.success || !result.purchase) {
        if (license) {
          license.active = false;
          await license.save();
        }
        return {
          error: NextResponse.json(
            { error: result.message || "Invalid license key" },
            { status: 403 }
          ),
          userId: null as string | null,
          licenseKey: null as string | null,
        };
      }

      if (result.purchase.refunded || result.purchase.chargebacked) {
        if (license) {
          license.active = false;
          await license.save();
        }
        return {
          error: NextResponse.json({ error: "License has been revoked" }, { status: 403 }),
          userId: null as string | null,
          licenseKey: null as string | null,
        };
      }

      if (license) {
        license.active = true;
        license.validatedAt = new Date();
        license.uses = result.purchase.uses;
        license.purchaseEmail = result.purchase.email;
        license.gumroadPurchaseId = result.purchase.id;
        await license.save();
      } else {
        license = await License.create({
          licenseKey,
          productId: result.purchase.product_id,
          purchaseEmail: result.purchase.email,
          gumroadPurchaseId: result.purchase.id,
          active: true,
          uses: result.purchase.uses,
          validatedAt: new Date(),
        });
      }
    } catch (err) {
      // If Gumroad API is unreachable but we have a cached valid license, allow it
      if (license?.active) {
        const userId = licenseKeyToUserId(licenseKey);
        return { error: null, userId, licenseKey };
      }
      console.error("[license-auth] Gumroad validation error:", err);
      return {
        error: NextResponse.json({ error: "License validation failed" }, { status: 500 }),
        userId: null as string | null,
        licenseKey: null as string | null,
      };
    }
  }

  const userId = licenseKeyToUserId(licenseKey);
  return { error: null, userId, licenseKey };
}
