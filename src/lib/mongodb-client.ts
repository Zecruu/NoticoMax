import { MongoClient } from "mongodb";
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

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

function connectWithRetry(uri: string): Promise<MongoClient> {
  const client = new MongoClient(uri, MONGO_OPTIONS);
  return client.connect().catch(async (err) => {
    console.warn("[mongodb-client] First connection attempt failed, retrying...", err.message);
    await new Promise((r) => setTimeout(r, 2000));
    const retryClient = new MongoClient(uri, {
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });
    return retryClient.connect();
  });
}

function getClientPromise(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    return Promise.reject(new Error("MONGODB_URI not configured"));
  }

  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      global._mongoClientPromise = connectWithRetry(uri);
    }
    return global._mongoClientPromise;
  }

  return connectWithRetry(uri);
}

// Lazy — only connects when actually used
const clientPromise = getClientPromise();

export default clientPromise;
