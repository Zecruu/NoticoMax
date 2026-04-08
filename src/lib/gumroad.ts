import crypto from "crypto";

/**
 * Generate a product key in the format NMAX-XXXX-XXXX-XXXX
 * Uses cryptographically random characters (uppercase + digits)
 */
export function generateProductKey(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  const segment = () => {
    const bytes = crypto.randomBytes(4);
    return Array.from(bytes)
      .map((b) => chars[b % chars.length])
      .join("");
  };
  return `NMAX-${segment()}-${segment()}-${segment()}`;
}
