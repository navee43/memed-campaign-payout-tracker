import express from "express";
import request from "supertest";
import { errorHandler } from "../../src/middleware/error-handler";
import { MemoryWindowStore, rateLimit, resetMemoryRateLimits } from "../../src/middleware/rate-limit";

describe("MemoryWindowStore", () => {
  it("counts within a window and resets after it", () => {
    const store = new MemoryWindowStore();
    expect(store.increment("k", 1000, 0)).toBe(1);
    expect(store.increment("k", 1000, 500)).toBe(2);
    expect(store.increment("k", 1000, 1500)).toBe(1);
  });
});

describe("rateLimit middleware (Redis unavailable -> local fallback)", () => {
  beforeEach(() => resetMemoryRateLimits());

  function app(max: number) {
    const a = express();
    a.use(rateLimit({ name: "t", windowMs: 60_000, max, key: () => "same-client" }));
    a.get("/", (_req, res) => res.json({ ok: true }));
    a.use(errorHandler);
    return a;
  }

  it("allows up to the limit then returns 429 with Retry-After", async () => {
    const a = app(3);
    for (let i = 0; i < 3; i += 1) await request(a).get("/").expect(200);
    const res = await request(a).get("/").expect(429);
    expect(res.headers["retry-after"]).toBeDefined();
    expect(res.body.error.code).toBe("RATE_LIMITED");
    expect(res.headers["ratelimit-remaining"]).toBe("0");
  });

  it("skips requests whose key is null", async () => {
    const a = express();
    a.use(rateLimit({ name: "skip", windowMs: 60_000, max: 1, key: () => null }));
    a.get("/", (_req, res) => res.json({ ok: true }));
    await request(a).get("/").expect(200);
    await request(a).get("/").expect(200);
  });
});
