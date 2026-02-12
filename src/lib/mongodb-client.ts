import { MongoClient } from "mongodb";

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

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

const MONGO_OPTIONS = {
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
};

function connectWithRetry(uri: string): Promise<MongoClient> {
  ensureDns();
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
