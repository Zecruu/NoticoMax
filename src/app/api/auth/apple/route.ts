import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";
import License from "@/models/License";
import { computeEntitlements } from "@/lib/entitlements";
import { verifyAppleIdentityToken, exchangeAppleCode } from "@/lib/auth/apple";

export const runtime = "nodejs";

interface AppleAuthRequest {
  identityToken?: string;
  code?: string;
  email?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AppleAuthRequest;

    let idToken: string;
    if (body.identityToken) {
      idToken = body.identityToken;
    } else if (body.code) {
      const { id_token } = await exchangeAppleCode(body.code);
      idToken = id_token;
    } else {
      return NextResponse.json(
        { error: "identityToken or code is required" },
        { status: 400 }
      );
    }

    const payload = await verifyAppleIdentityToken(idToken);

    await dbConnect();

    // Resolve user: first by appleUserId, then by Apple-verified email (for linking).
    // IMPORTANT: only Apple-verified email (payload.email) is trusted for linking —
    // never the client-supplied body.email, which could be forged to hijack accounts.
    let user = await User.findOne({ appleUserId: payload.sub });

    if (!user) {
      const verifiedEmail = payload.email && payload.emailVerified
        ? payload.email.toLowerCase().trim()
        : null;

      if (verifiedEmail) {
        user = await User.findOne({ email: verifiedEmail });
        if (user) {
          user.appleUserId = payload.sub;
        }
      }

      if (!user) {
        if (!verifiedEmail) {
          return NextResponse.json(
            { error: "Apple did not provide a verified email. Try signing in again or use email/password." },
            { status: 400 }
          );
        }

        user = new User({
          email: verifiedEmail,
          appleUserId: payload.sub,
          // Random password that can't be used (user signs in via Apple)
          salt: crypto.randomBytes(16).toString("hex"),
          passwordHash: crypto.randomBytes(32).toString("hex"),
          sessionTokens: [],
          entitlements: {
            lifetimePro: false,
          },
        });
      }
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[auth/apple] Error:", message);
    return NextResponse.json(
      { error: "Apple sign-in failed", detail: message },
      { status: 500 }
    );
  }
}
