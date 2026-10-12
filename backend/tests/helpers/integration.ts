import { randomUUID } from "node:crypto";
import type { Express } from "express";
import mongoose from "mongoose";
import request from "supertest";
import type TestAgent from "supertest/lib/agent";
import { createApp } from "../../src/app";
import { connectDatabase, disconnectDatabase } from "../../src/config/db";
import { resetEnvCache } from "../../src/config/env";
import { connectRedis, disconnectRedis, getRedis } from "../../src/config/redis";
import { resetMemoryRateLimits } from "../../src/middleware/rate-limit";
import { initModels } from "../../src/models";
import type { Role } from "../../src/types/domain";

export const SERVICE_KEY = process.env.VIEW_UPDATE_SERVICE_KEY!;
export const PASSWORD = "CorrectHorse42";

/** Each test file gets its own database so files never interfere. */
export async function startIntegration(tag: string): Promise<Express> {
  const uri = process.env.MONGODB_TEST_URI;
  if (!uri) throw new Error("MONGODB_TEST_URI not set — global setup did not start a replica set");
  process.env.MONGODB_DB_NAME = `memed_test_${tag}_${process.pid}`;
  resetEnvCache();
  await connectDatabase(uri);
  await initModels();
  await connectRedis();
  return createApp();
}

export async function stopIntegration(): Promise<void> {
  await mongoose.connection.dropDatabase().catch(() => undefined);
  await disconnectDatabase();
  await disconnectRedis();
}

/** Wipes every collection through the raw driver (bypasses the ledger's append-only hooks). */
export async function resetDatabase(): Promise<void> {
  const db = mongoose.connection.db!;
  const collections = await db.collections();
  await Promise.all(collections.map((c) => c.deleteMany({})));
  resetMemoryRateLimits();
  const redis = getRedis();
  if (redis?.status === "ready") {
    const prefix = redis.options.keyPrefix ?? "";
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) await redis.del(...keys.map((k) => k.slice(prefix.length)));
  }
}

export function cookieValue(res: request.Response, name: string): string | undefined {
  const raw = res.headers["set-cookie"] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  return line ? decodeURIComponent(line.split(";")[0]!.slice(name.length + 1)) : undefined;
}

export interface TestUser {
  agent: TestAgent;
  csrf: string;
  id: string;
  email: string;
  name: string;
  role: Role;
}

export async function registerUser(app: Express, role: Role, name = `${role === "BRAND" ? "Brand" : "Creator"} ${randomUUID().slice(0, 6)}`): Promise<TestUser> {
  const agent = request.agent(app);
  const pre = await agent.get("/api/auth/csrf").expect(200);
  const email = `${role.toLowerCase()}-${randomUUID()}@test.memed.dev`;
  const res = await agent
    .post("/api/auth/signup")
    .set("x-csrf-token", pre.body.data.csrfToken as string)
    .send({ name, email, password: PASSWORD, role })
    .expect(201);
  return { agent, csrf: cookieValue(res, "memed_csrf")!, id: res.body.data.user.id as string, email, name, role };
}

/** Rupee helper for readable tests: rs(500) === 50_000 paise. */
export const rs = (rupees: number) => rupees * 100;

export const DEFAULT_LADDER = [
  { views: 10_000, payoutPaise: rs(500) },
  { views: 50_000, payoutPaise: rs(2_000) },
  { views: 100_000, payoutPaise: rs(5_000) },
];

export async function createCampaign(
  brand: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; body: Record<string, unknown> }> {
  const res = await brand.agent
    .post("/api/campaigns")
    .set("x-csrf-token", brand.csrf)
    .send({
      name: `Campaign ${randomUUID().slice(0, 6)}`,
      description: "Test campaign",
      platform: "INSTAGRAM",
      budgetPaise: rs(20_000),
      milestones: DEFAULT_LADDER,
      status: "LIVE",
      ...overrides,
    });
  if (res.status !== 201) throw new Error(`createCampaign failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { id: res.body.data.campaign.id as string, body: res.body.data.campaign as Record<string, unknown> };
}

let postCounter = 0;
export function nextInstagramUrl(): string {
  postCounter += 1;
  return `https://www.instagram.com/reel/Test${postCounter.toString().padStart(6, "0")}${randomUUID().slice(0, 4)}/`;
}

export async function submitPost(creator: TestUser, campaignId: string, postUrl = nextInstagramUrl()): Promise<string> {
  const res = await creator.agent.post(`/api/campaigns/${campaignId}/submissions`).set("x-csrf-token", creator.csrf).send({ postUrl });
  if (res.status !== 201) throw new Error(`submitPost failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.submission.id as string;
}

export function patchViews(app: Express, submissionId: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const req = request(app).patch(`/api/submissions/${submissionId}/views`).set("x-service-key", SERVICE_KEY);
  for (const [k, v] of Object.entries(headers)) req.set(k, v);
  return req.send(body);
}

/**
 * Emulates the ingestion service: a 503 (transaction retries exhausted under
 * contention) is safe to retry because nothing was changed.
 */
export async function patchViewsWithRetry(app: Express, submissionId: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  for (let i = 0; ; i += 1) {
    const res = await patchViews(app, submissionId, body, headers);
    if (res.status !== 503 || i >= 10) return res;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 80));
  }
}
