import type { NextFunction, Request, RequestHandler, Response } from "express";
import { safeRedis } from "../config/redis";
import { tooManyRequests } from "../utils/errors";

/**
 * Fixed-window rate limiter.
 *
 * Counters live in Redis so limits hold across every API instance. If Redis is
 * unavailable the limiter falls back to a per-instance in-memory window, which
 * is weaker (limits multiply by instance count) but keeps protection on rather
 * than failing open or taking the API down.
 */

export interface RateLimitOptions {
  name: string;
  windowMs: number;
  max: number;
  key: (req: Request) => string | null;
  message?: string;
}

const INCR_WITH_TTL = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return c`;

interface MemoryEntry {
  count: number;
  expiresAt: number;
}

export class MemoryWindowStore {
  private readonly entries = new Map<string, MemoryEntry>();

  increment(key: string, windowMs: number, now = Date.now()): number {
    if (this.entries.size > 10_000) this.sweep(now);
    const existing = this.entries.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.entries.set(key, { count: 1, expiresAt: now + windowMs });
      return 1;
    }
    existing.count += 1;
    return existing.count;
  }

  private sweep(now: number): void {
    for (const [k, v] of this.entries) if (v.expiresAt <= now) this.entries.delete(k);
  }

  clear(): void {
    this.entries.clear();
  }
}

const memoryStore = new MemoryWindowStore();

export function resetMemoryRateLimits(): void {
  memoryStore.clear();
}

export async function hitRateLimit(bucket: string, windowMs: number, now = Date.now()): Promise<{ count: number; resetMs: number; store: "redis" | "memory" }> {
  const windowIndex = Math.floor(now / windowMs);
  const key = `rl:${bucket}:${windowIndex}`;
  const resetMs = (windowIndex + 1) * windowMs - now;
  const redisCount = await safeRedis<number | null>(
    async (r) => Number(await r.eval(INCR_WITH_TTL, 1, key, String(windowMs))),
    null,
    "rate-limit",
  );
  if (redisCount !== null && Number.isFinite(redisCount)) return { count: redisCount, resetMs, store: "redis" };
  return { count: memoryStore.increment(key, windowMs, now), resetMs, store: "memory" };
}

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const subject = opts.key(req);
    if (subject === null) return next();
    const { count, resetMs } = await hitRateLimit(`${opts.name}:${subject}`, opts.windowMs);
    const remaining = Math.max(0, opts.max - count);
    const resetSeconds = Math.ceil(resetMs / 1000);
    res.setHeader("RateLimit-Limit", String(opts.max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(resetSeconds));
    if (count > opts.max) {
      res.setHeader("Retry-After", String(resetSeconds));
      return next(tooManyRequests(opts.message));
    }
    next();
  };
}

export const byIp = (req: Request): string => req.ip ?? "unknown";
