import type { Request, Response } from "express";
import { env } from "../config/env";
import { isDatabaseReady, pingDatabase } from "../config/db";
import { isRedisReady, getRedis } from "../config/redis";
import { ok } from "../utils/api-response";

let shuttingDown = false;
export function markShuttingDown(): void {
  shuttingDown = true;
}

/** Liveness: the process is up and the event loop responds. */
export function live(_req: Request, res: Response) {
  return ok(res, { status: "ok" });
}

/**
 * Readiness: safe to receive traffic. MongoDB is required; Redis is optional
 * (reported as "degraded" so operators see it, but traffic still flows).
 * Returns 503 while draining during shutdown so the load balancer stops routing here.
 */
export async function ready(_req: Request, res: Response) {
  const mongo = isDatabaseReady() && (await pingDatabase());
  const redisConfigured = Boolean(getRedis());
  const redis = redisConfigured ? (isRedisReady() ? "up" : "down") : "not_configured";
  const status = shuttingDown ? "draining" : !mongo ? "unavailable" : redis === "down" ? "degraded" : "ok";
  res.status(shuttingDown || !mongo ? 503 : 200).json({
    success: status !== "unavailable" && status !== "draining",
    data: { status, checks: { mongo: mongo ? "up" : "down", redis } },
  });
}

/** Non-secret runtime flags the frontend needs (e.g. whether to show the view simulator). */
export function publicConfig(_req: Request, res: Response) {
  const cfg = env();
  return ok(res, { viewUpdateMode: cfg.VIEW_UPDATE_MODE, viewSimulationEnabled: cfg.VIEW_UPDATE_MODE === "simulation" });
}
