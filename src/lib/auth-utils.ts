import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import dbConnect from "@/lib/mongodb";
import User from "@/models/User";

export async function getAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}

export async function requireAuth() {
  const user = await getAuthenticatedUser();
  if (!user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      user: null,
    };
  }
  return { error: null, user };
}

export async function requirePro() {
  const { error, user } = await requireAuth();
  if (error) return { error, user: null };

  // Verify tier from database (don't trust JWT alone for payment-gated features)
  await dbConnect();
  const dbUser = await User.findById(user!.id);
  if (
    !dbUser ||
    dbUser.tier !== "pro" ||
    (dbUser.stripeCurrentPeriodEnd && dbUser.stripeCurrentPeriodEnd < new Date())
  ) {
    return {
      error: NextResponse.json(
        { error: "Pro subscription required" },
        { status: 403 }
      ),
      user: null,
    };
  }
  return { error: null, user };
}
