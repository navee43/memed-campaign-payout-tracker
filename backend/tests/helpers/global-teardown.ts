import type { MongoMemoryReplSet } from "mongodb-memory-server";

export default async function globalTeardown(): Promise<void> {
  const replSet = (globalThis as { __MEMED_REPLSET__?: MongoMemoryReplSet }).__MEMED_REPLSET__;
  if (replSet) await replSet.stop();
}
