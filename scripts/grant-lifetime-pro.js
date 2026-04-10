/**
 * One-shot migration: grant lifetime Pro entitlements to specific users.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/grant-lifetime-pro.js
 *
 * Edit LIFETIME_PRO_EMAILS below to add more users.
 */

const mongoose = require("mongoose");

const LIFETIME_PRO_EMAILS = [
  "nomnk5138@gmail.com",
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI environment variable is required");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log("Connected to MongoDB");

  const User = mongoose.connection.collection("users");

  for (const email of LIFETIME_PRO_EMAILS) {
    const result = await User.updateOne(
      { email: email.toLowerCase() },
      {
        $set: {
          "entitlements.lifetimePro": true,
          "entitlements.proSource": "lifetime",
        },
        $unset: {
          "entitlements.proExpiresAt": "",
        },
      }
    );
    if (result.matchedCount === 0) {
      console.warn(`  ! No user found for ${email}`);
    } else {
      console.log(`  ✓ Granted lifetime Pro to ${email}`);
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
