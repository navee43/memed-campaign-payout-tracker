import { env } from "../../config/env";
import { safeRedis } from "../../config/redis";
import { sha256, stableStringify } from "../../utils/crypto";

/**
 * Discovery-list cache.
 *
 * Keys embed a global version number. Invalidation is a single INCR of that
 * version: every existing list key becomes unreachable at once and simply
 * expires via its TTL. This avoids KEYS/SCAN sweeps and races between
 * "delete keys" and "repopulate keys".
 *
 * Cache entries are display data only. Budget enforcement always reads MongoDB.
 */

const VERSION_KEY = "campaigns:list:version";

export type CacheStatus = "HIT" | "MISS" | "BYPASS";

async function currentVersion(): Promise<string | null> {
  return safeRedis(async (r) => (await r.get(VERSION_KEY)) ?? "0", null, "cache-version");
}

function listKey(version: string, query: unknown): string {
  return `campaigns:list:v${version}:${sha256(stableStringify(query)).slice(0, 32)}`;
}

export async function readCampaignList<T>(query: unknown): Promise<{ status: CacheStatus; value: T | null; key: string | null }> {
  const version = await currentVersion();
  if (version === null) return { status: "BYPASS", value: null, key: null };
  const key = listKey(version, query);
  const raw = await safeRedis((r) => r.get(key), null, "cache-read");
  if (raw === null) return { status: "MISS", value: null, key };
  try {
    return { status: "HIT", value: JSON.parse(raw) as T, key };
  } catch {
    return { status: "MISS", value: null, key };
  }
}

export async function writeCampaignList(key: string | null, value: unknown): Promise<void> {
  if (!key) return;
  await safeRedis((r) => r.set(key, JSON.stringify(value), "EX", env().CAMPAIGN_CACHE_TTL_SECONDS), null, "cache-write");
}

/** Call after any change that can alter what discovery lists show. */
export async function invalidateCampaignLists(): Promise<void> {
  await safeRedis((r) => r.incr(VERSION_KEY), null, "cache-invalidate");
}
