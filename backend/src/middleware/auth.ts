import type { NextFunction, Request, Response } from "express";
import { User } from "../models/user.model";
import { verifyAccessToken } from "../services/auth/token.service";
import type { AuthUser, Role } from "../types/domain";
import { AppError, forbidden, unauthorized } from "../utils/errors";
import { ACCESS_COOKIE } from "../utils/cookies";

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}

/**
 * Authentication: proves WHO is calling (valid, unexpired access token for an
 * active account whose token version still matches).
 */
export async function authenticate(req: Request): Promise<AuthUser | null> {
  const token = (req.cookies as Record<string, string | undefined> | undefined)?.[ACCESS_COOKIE];
  if (!token) return null;
  const result = verifyAccessToken(token);
  if (!result.ok) {
    if (result.reason === "expired") throw new AppError(401, "TOKEN_EXPIRED", "Your session expired. Refreshing…");
    throw unauthorized();
  }
  const user = await User.findById(result.claims.sub, { name: 1, email: 1, role: 1, status: 1, tokenVersion: 1 }).lean();
  if (!user || user.status !== "ACTIVE" || (user.tokenVersion ?? 0) !== result.claims.tv) throw unauthorized();
  return { id: String(user._id), role: user.role, name: user.name, email: user.email };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const user = await authenticate(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/**
 * Authorization: decides WHAT the authenticated caller may do. Role checks
 * happen here; resource ownership checks happen in the services, which always
 * scope queries by the caller's id.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) {
      throw forbidden(roles.length === 1 ? `Only ${roles[0]!.toLowerCase()} accounts can do that.` : undefined);
    }
    next();
  };
}

export function currentUser(req: Request): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** Attaches req.user when a valid session exists; never rejects. */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    req.user = (await authenticate(req)) ?? undefined;
  } catch {
    req.user = undefined;
  }
  next();
}
