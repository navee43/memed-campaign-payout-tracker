import type { MongoMemoryReplSet } from "mongodb-memory-server";
import { applyLegacyMongodShim } from "./legacy-mongod-shim";

/**
 * Starts a single-node replica set (transactions need a replica set) unless
 * MONGODB_TEST_URI points at an existing test deployment. Set
 * MONGOMS_SYSTEM_BINARY to use a locally installed mongod instead of a download.
 */
export default async function globalSetup(): Promise<void> {
  if (process.env.MONGODB_TEST_URI) return;
  applyLegacyMongodShim();
  // Imported lazily so the (optional) shim runs before the driver loads.
  const { MongoMemoryReplSet: ReplSet } = await import("mongodb-memory-server");
  const replSet: MongoMemoryReplSet = await ReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger", name: "rs0" },
  });
  await replSet.waitUntilRunning();
  (globalThis as { __MEMED_REPLSET__?: MongoMemoryReplSet }).__MEMED_REPLSET__ = replSet;
  process.env.MONGODB_TEST_URI = replSet.getUri();
}
