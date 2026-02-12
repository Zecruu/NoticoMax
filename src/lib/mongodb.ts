import mongoose from "mongoose";
import dns from "node:dns";

// Ensure DNS resolvers support SRV record lookups (required for mongodb+srv://)
// Electron production builds may use system DNS that refuses SRV queries
try {
  const servers = dns.getServers();
  const hasPublicDns = servers.some(
    (s) => s === "8.8.8.8" || s === "8.8.4.4" || s === "1.1.1.1" || s === "1.0.0.1"
  );
  if (!hasPublicDns) {
    dns.setServers([...servers, "8.8.8.8", "1.1.1.1"]);
  }
} catch {
  // Ignore — non-critical if this fails
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
