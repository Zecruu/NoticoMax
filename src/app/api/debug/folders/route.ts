import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/debug/folders
// Returns what THIS USER can see from the folders / households / household_members
// tables. Useful when "I created a family but no folder shows up" — the answer
// is in one of:
//   1. The folder isn't on the server (would be missing from `folders`)
//   2. The folder is there but RLS denies the read (folderCount=0 + error)
//   3. The folder is there AND readable but the mapper drops household_id
//      (you'd see household_id in the raw row)
//
// Hit https://app.noticomax.com/api/debug/folders in any browser while signed in.
export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: claims, error: claimsErr } = await supabase.auth.getClaims();
  if (claimsErr || !claims?.claims) {
    return NextResponse.json({ authenticated: false, error: "Not signed in — sign in via the app first" }, { status: 401 });
  }
  const userId = claims.claims.sub as string;

  // Folders the user can see (via RLS)
  const { data: folders, error: foldersErr } = await supabase
    .from("folders")
    .select("client_id, name, user_id, household_id, share_mode, deleted, created_at")
    .order("created_at", { ascending: false });

  // Households the user can see
  const { data: households, error: householdsErr } = await supabase
    .from("households")
    .select("id, name, family_code, owner_user_id, max_seats, subscription_plan");

  // Memberships
  const { data: memberships, error: membershipsErr } = await supabase
    .from("household_members")
    .select("household_id, user_id, role");

  return NextResponse.json({
    authenticated: true,
    userId,
    folders: {
      count: folders?.length ?? 0,
      sharedCount: (folders ?? []).filter((f) => f.household_id).length,
      personalCount: (folders ?? []).filter((f) => !f.household_id).length,
      error: foldersErr?.message ?? null,
      rows: folders ?? [],
    },
    households: {
      count: households?.length ?? 0,
      error: householdsErr?.message ?? null,
      rows: households ?? [],
    },
    memberships: {
      count: memberships?.length ?? 0,
      error: membershipsErr?.message ?? null,
      rows: memberships ?? [],
    },
  });
}
