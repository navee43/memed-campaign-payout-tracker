import { randomUUID } from "node:crypto";
import { safeRedis } from "../config/redis";

const RELEASE = `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end`;

/**
 * Best-effort distributed lock so only one API instance runs a periodic job at
 * a time. It is an efficiency measure only: if Redis is down every instance
 * runs the job, which is still correct because the work itself is
 * transactional and idempotent.
 */
export async function withJobLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | null> {
  const token = randomUUID();
  const key = `lock:${name}`;
  const acquired = await safeRedis(async (r) => (await r.set(key, token, "PX", ttlMs, "NX")) === "OK", null, "lock-acquire");
  if (acquired === false) return null; // someone else holds it
  try {
    return await fn();
  } finally {
    if (acquired) await safeRedis((r) => r.eval(RELEASE, 1, key, token), null, "lock-release");
  }
}
