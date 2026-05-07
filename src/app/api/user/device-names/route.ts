import { NextRequest, NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export const runtime = "nodejs";

/**
 * GET — return the calling user's deviceNames map.
 * PUT — set or upsert one or many device-name mappings.
 *
 * Auth: Bearer session token in Authorization header, OR sessionToken in body
 * (matching the convention in other auth endpoints).
 */

async function findUserBySession(
  request: NextRequest
): Promise<typeof User.prototype | null> {
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const cloned = request.clone();
  let bodyToken: string | null = null;
  try {
    const body = await cloned.json();
    bodyToken = body?.sessionToken ?? null;
  } catch {
    /* may be GET or empty body */
  }
  const sessionToken = bearerToken || bodyToken;
  if (!sessionToken) return null;
  await dbConnect();
  return User.findOne({ sessionTokens: sessionToken });
}

export async function GET(request: NextRequest) {
  const user = await findUserBySession(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const map = user.deviceNames ?? new Map();
  // Mongoose Map → plain object for JSON
  const obj = Object.fromEntries(map);
  return NextResponse.json({ success: true, deviceNames: obj });
}

export async function PUT(request: NextRequest) {
  const user = await findUserBySession(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { deviceId?: string; name?: string; deviceNames?: Record<string, string> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!user.deviceNames) user.deviceNames = new Map();

  // Two shapes accepted:
  //   { deviceId, name }                      — set one
  //   { deviceNames: { id: name, ... } }      — bulk merge (overwrites overlapping keys)
  if (body.deviceId && typeof body.name === "string") {
    user.deviceNames.set(body.deviceId, body.name.trim());
  } else if (body.deviceNames && typeof body.deviceNames === "object") {
    for (const [id, name] of Object.entries(body.deviceNames)) {
      if (typeof name === "string") user.deviceNames.set(id, name.trim());
    }
  } else {
    return NextResponse.json(
      { error: "Body must include {deviceId, name} or {deviceNames: {...}}" },
      { status: 400 }
    );
  }

  await user.save();
  const obj = Object.fromEntries(user.deviceNames);
  return NextResponse.json({ success: true, deviceNames: obj });
}
