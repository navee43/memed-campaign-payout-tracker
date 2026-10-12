import { Redis } from "ioredis";
import { env } from "./env";
import { logger } from "./logger";

/**
 * Redis is used for caching, distributed rate limiting and best-effort job
 * coordination. It is deliberately NOT part of the financial correctness path:
 * every helper here degrades gracefully when Redis is slow or unavailable.
 */

let client: Redis | null = null;
let lastErrorLog = 0;

function logRedisError(err: unknown, context: string): void {
  const now = Date.now();
  // Throttle to one warning per 10s so an outage doesn't flood the logs.
  if (now - lastErrorLog > 10_000) {
    lastErrorLog = now;
    logger.warn({ err, context }, "Redis unavailable; continuing without it");
  }
}

export function createRedisClient(url: string): Redis {
  const cfg = env();
  const redis = new Redis(url, {
    keyPrefix: cfg.REDIS_KEY_PREFIX,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    commandTimeout: cfg.REDIS_COMMAND_TIMEOUT_MS,
    connectTimeout: 2_000,
    retryStrategy: (attempt) => Math.min(250 * 2 ** attempt, 5_000),
  });
  redis.on("error", (err) => logRedisError(err, "connection"));
  redis.on("ready", () => logger.info("Redis ready"));
  return redis;
}

export async function connectRedis(): Promise<Redis | null> {
  const url = env().REDIS_URL;
  if (!url) {
    logger.warn("REDIS_URL not set: caching and distributed rate limiting fall back to local/no-op behaviour");
    return null;
  }
  client = createRedisClient(url);
  try {
    await client.connect();
  } catch (err) {
    // Keep the client: ioredis keeps retrying in the background.
    logRedisError(err, "initial connect");
  }
  return client;
}

export function getRedis(): Redis | null {
  return client;
}

/** Test hook to inject or clear the client. */
export function setRedisClient(next: Redis | null): void {
  client = next;
}

export function isRedisReady(): boolean {
  return client?.status === "ready";
}

/**
 * Runs a Redis operation, returning `fallback` if Redis is not configured,
 * not connected, slow, or erroring. Callers never need their own try/catch.
 */
export async function safeRedis<T>(op: (r: Redis) => Promise<T>, fallback: T, context = "op"): Promise<T> {
  const r = client;
  if (!r || r.status !== "ready") return fallback;
  try {
    return await op(r);
  } catch (err) {
    logRedisError(err, context);
    return fallback;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
}
