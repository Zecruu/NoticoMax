import mongoose from "mongoose";

// Add public DNS fallbacks so mongodb+srv:// SRV lookups work in Electron
function ensureDns() {
  try {
    const dns = require("node:dns");
    const servers: string[] = dns.getServers();
    if (!servers.some((s: string) => s === "8.8.8.8" || s === "1.1.1.1")) {
      dns.setServers([...servers, "8.8.8.8", "1.1.1.1"]);
    }
  } catch {
    // Not available in Edge Runtime — ignored
  }
}

interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  // eslint-disable-next-line no-var
  var mongooseCache: MongooseCache | undefined;
}

const cached: MongooseCache = global.mongooseCache ?? { conn: null, promise: null };

if (!global.mongooseCache) {
  global.mongooseCache = cached;
}

async function dbConnect(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI not configured");
  }

  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    ensureDns();
    cached.promise = mongoose
      .connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000,
      })
      .then((m) => m)
      .catch(async (err) => {
        // Retry once after a short delay (DNS SRV can fail transiently)
        console.warn("[mongodb] First connection attempt failed, retrying...", err.message);
        await new Promise((r) => setTimeout(r, 2000));
        return mongoose.connect(uri, {
          serverSelectionTimeoutMS: 15000,
          connectTimeoutMS: 15000,
        });
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
