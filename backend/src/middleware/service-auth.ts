import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import { safeEqual } from "../utils/crypto";

declare module "express-serve-static-core" {
  interface Request {
    viewUpdateActor?: "SERVICE" | "SIMULATION";
  }
}

export const SERVICE_KEY_HEADER = "x-service-key";

/**
 * Guards PATCH /api/submissions/:id/views.
 *
 * The assignment says this endpoint has no brand/creator role check — it stands
 * in for the platform's view feed. It is still never an open public endpoint:
 *  - internal mode (production default): caller must present the trusted
 *    service credential in X-Service-Key.
 *  - simulation mode (local/demo): no credential needed, so evaluators and the
 *    in-app "simulate views" control can drive it. Refused in production unless
 *    explicitly allowed for a disposable demo.
 * Both modes are rate limited, strictly validated and audit logged.
 */
export function requireViewUpdateCaller(req: Request, _res: Response, next: NextFunction): void {
  const cfg = env();
  const presented = req.header(SERVICE_KEY_HEADER);
  if (presented && cfg.VIEW_UPDATE_SERVICE_KEY && safeEqual(presented, cfg.VIEW_UPDATE_SERVICE_KEY)) {
    req.viewUpdateActor = "SERVICE";
    return next();
  }
  if (cfg.VIEW_UPDATE_MODE === "simulation") {
    req.viewUpdateActor = "SIMULATION";
    return next();
  }
  throw new AppError(401, "SERVICE_KEY_REQUIRED", "This endpoint is restricted to the trusted view-ingestion service.");
}
