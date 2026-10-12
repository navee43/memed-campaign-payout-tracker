import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../utils/errors";
import { CSRF_COOKIE, CSRF_HEADER } from "../utils/cookies";
import { safeEqual } from "../utils/crypto";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Routes that don't use cookie authentication and therefore can't be the
 * target of a CSRF attack: the view-update endpoint authenticates with a
 * service key (or is an explicit unauthenticated simulation).
 */
const EXEMPT = [/^\/api\/submissions\/[^/]+\/views\/?$/];

/**
 * CSRF protection for cookie-authenticated requests:
 *  1. SameSite=Lax cookies (browsers won't attach them to cross-site POSTs)
 *  2. Origin check against the CORS allow-list when the browser sends Origin
 *  3. Double-submit token: X-CSRF-Token header must equal the memed_csrf cookie
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method) || EXEMPT.some((r) => r.test(req.path))) return next();

  const origin = req.header("origin");
  if (origin && !env().CORS_ORIGINS.includes(origin)) {
    throw new AppError(403, "CSRF_ORIGIN_REJECTED", "Request origin is not allowed.");
  }

  const cookieToken = (req.cookies as Record<string, string | undefined> | undefined)?.[CSRF_COOKIE];
  const headerToken = req.header(CSRF_HEADER);
  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new AppError(403, "CSRF_TOKEN_INVALID", "Your security token is missing or expired. Please refresh the page and try again.");
  }
  next();
}
