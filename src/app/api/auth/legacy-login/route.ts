import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Lazy migration endpoint for users imported from MongoDB with PBKDF2 hashes.
 *
 * Flow on the client:
 *   1. Try `supabase.auth.signInWithPassword({ email, password })`.
 *   2. If that fails with "Invalid login credentials", POST here with same creds.
 *   3. If we verify the legacy hash, we set a new bcrypt password via the
 *      auth.admin API and delete the legacy_auth row. Client then retries
 *      signInWithPassword and gets a session.
 *
 * Returns 200 on successful migration, 401 on invalid creds, 404 if no
 * legacy hash exists for this user.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = (await request.json()) as {
      email?: string;
      password?: string;
    };

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password required" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdminClient();
    const normalizedEmail = email.toLowerCase().trim();

    // Find the user by email.
    // listUsers doesn't support email filtering directly; we query auth.users via SQL.
    const { data: userRow, error: userErr } = await admin
      .schema("auth")
      .from("users")
      .select("id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (userErr || !userRow) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const userId = userRow.id as string;

    // Look up the legacy hash row.
    const { data: legacy, error: legacyErr } = await admin
      .from("legacy_auth")
      .select("password_hash, salt")
      .eq("user_id", userId)
      .maybeSingle();

    if (legacyErr || !legacy) {
      // No legacy row — user was created natively or already migrated.
      return NextResponse.json({ error: "No legacy credentials" }, { status: 404 });
    }

    // Verify the PBKDF2 hash (matches the original Mongoose User model).
    const computedHash = crypto
      .pbkdf2Sync(password, legacy.salt as string, 10000, 64, "sha512")
      .toString("hex");

    if (computedHash !== legacy.password_hash) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    // Hash matches — upgrade to bcrypt via auth.admin.
    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password,
    });
    if (updateErr) {
      console.error("[legacy-login] updateUserById failed:", updateErr.message);
      return NextResponse.json({ error: "Migration failed" }, { status: 500 });
    }

    // Delete the legacy row so future logins go through Supabase Auth directly.
    await admin.from("legacy_auth").delete().eq("user_id", userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[legacy-login] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
