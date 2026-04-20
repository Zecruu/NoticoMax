import jwt, { type JwtHeader } from "jsonwebtoken";

const APPLE_ISS = "https://appleid.apple.com";
const APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";

export interface AppleIdentityPayload {
  sub: string;
  email?: string;
  emailVerified: boolean;
  isPrivateEmail: boolean;
}

interface AppleJwk {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

let cachedKeys: { keys: AppleJwk[]; fetchedAt: number } | null = null;
const KEYS_TTL_MS = 10 * 60 * 1000;

async function fetchAppleKeys(): Promise<AppleJwk[]> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < KEYS_TTL_MS) {
    return cachedKeys.keys;
  }
  const res = await fetch(APPLE_KEYS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Apple keys: ${res.status}`);
  const data = (await res.json()) as { keys: AppleJwk[] };
  cachedKeys = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function jwkToPem(jwk: AppleJwk): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createPublicKey } = require("crypto") as typeof import("crypto");
  const keyObject = createPublicKey({
    key: jwk as unknown as import("crypto").JsonWebKey,
    format: "jwk",
  });
  return keyObject.export({ type: "spki", format: "pem" }).toString();
}

/**
 * Verify an Apple identity token (JWT). Returns the parsed payload on success.
 * Throws on any validation failure (bad signature, wrong issuer, expired, etc.).
 */
export async function verifyAppleIdentityToken(
  identityToken: string
): Promise<AppleIdentityPayload> {
  const clientId = process.env.APPLE_CLIENT_ID;
  const bundleId = process.env.APPLE_BUNDLE_ID || "com.noticomax.app";
  if (!clientId) throw new Error("APPLE_CLIENT_ID not configured");

  const decoded = jwt.decode(identityToken, { complete: true });
  if (!decoded || typeof decoded === "string") {
    throw new Error("Malformed identity token");
  }
  const header = decoded.header as JwtHeader & { kid?: string };
  if (!header.kid) throw new Error("Missing kid in token header");

  const keys = await fetchAppleKeys();
  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error(`Apple public key not found for kid ${header.kid}`);

  const pem = jwkToPem(jwk);

  // Native iOS tokens are signed with audience = bundle ID.
  // Web/Services tokens are signed with audience = services ID (APPLE_CLIENT_ID).
  const validAudiences: [string, string] = [clientId, bundleId];

  const payload = jwt.verify(identityToken, pem, {
    algorithms: ["RS256"],
    issuer: APPLE_ISS,
    audience: validAudiences,
  }) as jwt.JwtPayload;

  if (!payload.sub) throw new Error("Missing sub in token payload");

  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified: payload.email_verified === true || payload.email_verified === "true",
    isPrivateEmail: payload.is_private_email === true || payload.is_private_email === "true",
  };
}

/**
 * Generate the client_secret JWT Apple requires for code exchange.
 * Signed with our .p8 private key using ES256.
 */
function generateAppleClientSecret(): string {
  const teamId = process.env.APPLE_TEAM_ID;
  const keyId = process.env.APPLE_KEY_ID;
  const clientId = process.env.APPLE_CLIENT_ID;
  const privateKeyBase64 = process.env.APPLE_PRIVATE_KEY_BASE64;

  if (!teamId || !keyId || !clientId || !privateKeyBase64) {
    throw new Error("Apple Sign-In environment variables not configured");
  }

  const privateKey = Buffer.from(privateKeyBase64, "base64").toString("utf-8");

  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: teamId,
      iat: now,
      exp: now + 10 * 60,
      aud: APPLE_ISS,
      sub: clientId,
    },
    privateKey,
    {
      algorithm: "ES256",
      header: { alg: "ES256", kid: keyId },
    }
  );
}

/**
 * Exchange an authorization code (from the web/Electron flow) for tokens.
 * Returns the id_token that can then be verified via verifyAppleIdentityToken.
 */
export async function exchangeAppleCode(code: string): Promise<{
  id_token: string;
  refresh_token?: string;
}> {
  const clientId = process.env.APPLE_CLIENT_ID;
  const redirectUri = process.env.APPLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    throw new Error("APPLE_CLIENT_ID or APPLE_REDIRECT_URI not configured");
  }

  const clientSecret = generateAppleClientSecret();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  const res = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apple token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as {
    id_token: string;
    refresh_token?: string;
    error?: string;
  };

  if (data.error) throw new Error(`Apple token exchange error: ${data.error}`);
  if (!data.id_token) throw new Error("Missing id_token in token response");

  return { id_token: data.id_token, refresh_token: data.refresh_token };
}
