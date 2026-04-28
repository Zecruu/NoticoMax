/**
 * One-shot migration: MongoDB → Supabase.
 *
 * Reads from MONGODB_URI, writes to NEXT_PUBLIC_SUPABASE_URL using
 * SUPABASE_SECRET_KEY (service role).
 *
 * Run from the repo root:
 *   node scripts/migrate-mongo-to-supabase.js              # dry run
 *   node scripts/migrate-mongo-to-supabase.js --apply      # actually write
 *
 * Idempotent-ish: re-runs will fail to create users that already exist; the
 * script reports those and continues with their existing Supabase user_id so
 * items/folders still link correctly.
 */

const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

const crypto = require("crypto");
const { MongoClient } = require("mongodb");
const { createClient } = require("@supabase/supabase-js");

const APPLY = process.argv.includes("--apply");

function licenseKeyToUserId(key) {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 24);
}

async function findOrCreateSupabaseUser(supabase, mongoUser) {
  const email = mongoUser.email.toLowerCase().trim();

  // Check if already exists
  const { data: existing } = await supabase.auth.admin.listUsers();
  const found = existing?.users?.find(
    (u) => (u.email || "").toLowerCase() === email
  );
  if (found) {
    console.log(`  • already exists: ${email} → ${found.id}`);
    return found.id;
  }

  if (!APPLY) {
    console.log(`  • [dry] would create: ${email}`);
    return "00000000-0000-0000-0000-000000000000";
  }

  // Random password — user will log in via /api/auth/legacy-login which
  // verifies the PBKDF2 hash and upgrades it.
  const tempPassword = crypto.randomBytes(32).toString("hex");
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  });
  if (error) throw new Error(`createUser ${email}: ${error.message}`);
  console.log(`  • created: ${email} → ${data.user.id}`);
  return data.user.id;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

  if (!mongoUri || !supabaseUrl || !supabaseSecret) {
    console.error(
      "Missing env: need MONGODB_URI, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY"
    );
    process.exit(1);
  }

  console.log(APPLY ? "MIGRATION (writes enabled)" : "DRY RUN (--apply to commit)");
  console.log("");

  const mongo = new MongoClient(mongoUri);
  await mongo.connect();
  const db = mongo.db();

  const supabase = createClient(supabaseUrl, supabaseSecret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Users ──
  console.log("Users");
  const users = await db.collection("users").find().toArray();
  const emailToSupabaseId = new Map();

  for (const u of users) {
    const supaId = await findOrCreateSupabaseUser(supabase, u);
    emailToSupabaseId.set(u.email.toLowerCase().trim(), supaId);

    if (APPLY) {
      // Legacy hash row
      const { error: laErr } = await supabase
        .from("legacy_auth")
        .upsert(
          {
            user_id: supaId,
            password_hash: u.passwordHash,
            salt: u.salt,
          },
          { onConflict: "user_id" }
        );
      if (laErr) console.error(`    legacy_auth ${u.email}:`, laErr.message);

      // Entitlements
      const e = u.entitlements || {};
      const { error: entErr } = await supabase.from("entitlements").upsert(
        {
          user_id: supaId,
          lifetime_pro: !!e.lifetimePro,
          pro_expires_at: e.proExpiresAt
            ? new Date(e.proExpiresAt).toISOString()
            : null,
          pro_source: e.proSource || null,
          apple_user_id: u.appleUserId || null,
        },
        { onConflict: "user_id" }
      );
      if (entErr) console.error(`    entitlements ${u.email}:`, entErr.message);
    }
  }
  console.log(`  → ${users.length} users processed`);
  console.log("");

  // ── Licenses ──
  console.log("Licenses");
  const licenses = await db.collection("licenses").find().toArray();
  const mongoUserIdToSupabaseId = new Map();

  for (const lic of licenses) {
    const supaId = lic.email
      ? emailToSupabaseId.get(lic.email.toLowerCase().trim()) ?? null
      : null;

    if (APPLY) {
      const { error } = await supabase.from("licenses").upsert(
        {
          license_key: lic.licenseKey,
          user_id: supaId,
          active: lic.active !== false,
          source: lic.source || null,
          created_at: lic.createdAt || new Date().toISOString(),
          activated_at: lic.activatedAt || null,
        },
        { onConflict: "license_key" }
      );
      if (error) console.error(`  ${lic.licenseKey}:`, error.message);
    }

    // Build map for items/folders migration
    if (supaId) {
      const hash = licenseKeyToUserId(lic.licenseKey);
      mongoUserIdToSupabaseId.set(hash, supaId);
    }
  }
  console.log(`  → ${licenses.length} licenses processed`);
  console.log("");

  // ── Folders ──
  console.log("Folders");
  const folders = await db.collection("folders").find().toArray();
  let foldersMigrated = 0;
  let foldersSkipped = 0;

  for (const f of folders) {
    const supaId = mongoUserIdToSupabaseId.get(f.userId);
    if (!supaId) {
      foldersSkipped++;
      continue;
    }

    if (APPLY) {
      const { error } = await supabase.from("folders").upsert(
        {
          client_id: f.clientId,
          user_id: supaId,
          name: f.name,
          color: f.color || null,
          deleted: !!f.deleted,
          created_at: f.createdAt,
          updated_at: f.updatedAt,
        },
        { onConflict: "client_id" }
      );
      if (error) {
        console.error(`  ${f.clientId}:`, error.message);
        foldersSkipped++;
      } else {
        foldersMigrated++;
      }
    } else {
      foldersMigrated++;
    }
  }
  console.log(`  → ${foldersMigrated} migrated, ${foldersSkipped} skipped`);
  console.log("");

  // ── Items ──
  console.log("Items");
  // Build set of valid folder client_ids so we can null-out dangling folder_id refs
  const { data: validFolders } = await supabase.from("folders").select("client_id");
  const validFolderIds = new Set((validFolders || []).map((f) => f.client_id));
  const items = await db.collection("items").find().toArray();
  let itemsMigrated = 0;
  let itemsSkipped = 0;

  for (const i of items) {
    const supaId = mongoUserIdToSupabaseId.get(i.userId);
    if (!supaId) {
      itemsSkipped++;
      continue;
    }

    if (APPLY) {
      const { error } = await supabase.from("items").upsert(
        {
          client_id: i.clientId,
          user_id: supaId,
          type: i.type,
          title: i.title || "",
          content: i.content || "",
          url: i.url || null,
          reminder_date: i.reminderDate || null,
          reminder_completed: i.reminderCompleted ?? null,
          tags: Array.isArray(i.tags) ? i.tags : [],
          pinned: !!i.pinned,
          color: i.color || null,
          folder_id: i.folderId && validFolderIds.has(i.folderId) ? i.folderId : null,
          device_id: i.deviceId || null,
          deleted: !!i.deleted,
          deleted_at: i.deletedAt || null,
          created_at: i.createdAt,
          updated_at: i.updatedAt,
        },
        { onConflict: "client_id" }
      );
      if (error) {
        console.error(`  ${i.clientId}:`, error.message);
        itemsSkipped++;
      } else {
        itemsMigrated++;
      }
    } else {
      itemsMigrated++;
    }
  }
  console.log(`  → ${itemsMigrated} migrated, ${itemsSkipped} skipped (no user mapping)`);
  console.log("");

  await mongo.close();

  console.log("Done.");
  if (!APPLY) {
    console.log("Re-run with --apply to actually write.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
