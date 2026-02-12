import { MongoClient } from "mongodb";

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
