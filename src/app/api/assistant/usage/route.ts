import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { requireBearerUser } from "@/lib/supabase/bearer-auth";
import { getLyteUsage } from "@/lib/ai/lyte-quota";
import { LYTE_PACKS, getPlan } from "@/lib/billing/plans";

export const runtime = "nodejs";

async function resolveUserId(request: NextRequest): Promise<
  { userId: string; error: null } | { userId: null; error: NextResponse }
> {
  const supabase = await getSupabaseServerClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const cookieUserId = claimsData?.claims?.sub as string | undefined;
  if (cookieUserId) return { userId: cookieUserId, error: null };

  const auth = await requireBearerUser(request);
  if (auth.error) return { userId: null, error: auth.error };
  return { userId: auth.userId, error: null };
}

/**
 * GET /api/assistant/usage — plan allowance + this month's Lyte meters.
 * Cookie session or Bearer. Does not require the assistant allow-list.
 */
export async function GET(request: NextRequest) {
  const gate = await resolveUserId(request);
  if (gate.error) return gate.error;

  const admin = getSupabaseAdminClient();
  const usage = await getLyteUsage(admin, gate.userId);
  const plan = getPlan(usage.planId);

  return NextResponse.json({
    planId: usage.planId,
    planName: plan.name,
    chats: usage.chats,
    lookups: usage.lookups,
    packs: LYTE_PACKS.map((pack) => ({
      productId: pack.productId,
      kind: pack.kind,
      amount: pack.amount,
      usd: pack.usd,
      name: pack.name,
      description: pack.description,
    })),
  });
}
