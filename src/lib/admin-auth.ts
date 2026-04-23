import { NextRequest } from "next/server";

/**
 * Validates an Authorization: Bearer <ADMIN_SECRET> header against env.
 * Returns true if valid. Uses timing-safe comparison.
 */
export function isAdminAuthorized(request: NextRequest): boolean {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7).trim();
  if (token.length !== secret.length) return false;

  // Constant-time comparison
  let mismatch = 0;
  for (let i = 0; i < secret.length; i++) {
    mismatch |= secret.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}
