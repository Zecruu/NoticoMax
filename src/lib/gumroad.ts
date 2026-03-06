export interface GumroadVerifyResult {
  success: boolean;
  purchase?: {
    id: string;
    product_id: string;
    email: string;
    license_key: string;
    uses: number;
    refunded: boolean;
    chargebacked: boolean;
  };
  message?: string;
}

export async function verifyGumroadLicense(
  licenseKey: string,
  incrementUses = false
): Promise<GumroadVerifyResult> {
  const productId = process.env.GUMROAD_PRODUCT_ID;
  if (!productId) {
    throw new Error("GUMROAD_PRODUCT_ID not configured");
  }

  const response = await fetch("https://api.gumroad.com/v2/licenses/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      product_id: productId,
      license_key: licenseKey,
      increment_uses_count: incrementUses ? "true" : "false",
    }),
  });

  return (await response.json()) as GumroadVerifyResult;
}
