import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

/**
 * Authenticate a request using a session token in the Authorization header.
 * Returns the user's MongoDB _id as userId, or an error response.
 */
export async function requireSession(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      error: NextResponse.json({ error: "Authorization required" }, { status: 401 }),
      userId: null as string | null,
      email: null as string | null,
    };
  }

  const sessionToken = authHeader.slice(7).trim();
  if (!sessionToken) {
    return {
      error: NextResponse.json({ error: "Session token required" }, { status: 401 }),
      userId: null as string | null,
      email: null as string | null,
    };
  }

  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("DB connection timed out")), 5000)
    );
    await Promise.race([dbConnect(), timeout]);
  } catch (err) {
    console.error("[session-auth] DB connect error:", (err as Error).message);
    return {
      error: NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 }),
      userId: null as string | null,
      email: null as string | null,
    };
  }

  const user = await User.findOne({ sessionTokens: sessionToken });
  if (!user) {
    return {
      error: NextResponse.json({ error: "Invalid or expired session" }, { status: 401 }),
      userId: null as string | null,
      email: null as string | null,
    };
  }

  return { error: null, userId: user._id.toString(), email: user.email };
}
