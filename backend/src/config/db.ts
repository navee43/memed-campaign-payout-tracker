import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

mongoose.set("strictQuery", true);

/**
 * Connects to MongoDB (Atlas in production). Transactions — which the payout
 * engine depends on — require a replica set or sharded cluster; Atlas clusters
 * always satisfy this. We verify it at startup so a misconfigured standalone
 * server fails loudly instead of silently weakening financial guarantees.
 */
export async function connectDatabase(uri = env().MONGODB_URI): Promise<typeof mongoose> {
  const cfg = env();
  mongoose.set("autoIndex", cfg.DB_AUTO_INDEX);

  await mongoose.connect(uri, {
    dbName: cfg.MONGODB_DB_NAME,
    maxPoolSize: cfg.MONGODB_MAX_POOL_SIZE,
    minPoolSize: Math.min(2, cfg.MONGODB_MAX_POOL_SIZE),
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
    w: "majority",
  });

  await assertTransactionsSupported();
  logger.info({ db: mongoose.connection.name }, "MongoDB connected");
  return mongoose;
}

async function assertTransactionsSupported(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB connection has no database handle");
  const hello = (await db.admin().command({ hello: 1 }).catch(() => db.admin().command({ isMaster: 1 }))) as {
    setName?: string;
    msg?: string;
  };
  const isReplicaSet = Boolean(hello.setName);
  const isMongos = hello.msg === "isdbgrid";
  if (!isReplicaSet && !isMongos) {
    throw new Error(
      "MongoDB must be a replica set or sharded cluster (e.g. MongoDB Atlas). The payout engine relies on multi-document transactions.",
    );
  }
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}

export async function pingDatabase(): Promise<boolean> {
  try {
    await mongoose.connection.db?.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
