import type { Request, Response } from "express";
import * as auth from "../services/auth/auth.service";
import { currentUser } from "../middleware/auth";
import { contextFrom } from "../types/context";
import { ok, created } from "../utils/api-response";
import { clearAuthCookies, CSRF_COOKIE, REFRESH_COOKIE, setAuthCookies, setCsrfCookie } from "../utils/cookies";
import { randomToken } from "../utils/crypto";
import { parse } from "../utils/validate";
import { loginSchema, signupSchema } from "../validators/auth.validators";

function cookie(req: Request, name: string): string | undefined {
  return (req.cookies as Record<string, string | undefined> | undefined)?.[name];
}

function applySession(res: Response, s: auth.IssuedSession): void {
  setAuthCookies(res, s.accessToken, s.refreshToken, s.refreshExpiresAt);
  setCsrfCookie(res, s.csrfToken);
}

/** Issues (or re-issues) the double-submit CSRF token for anonymous pages like login/signup. */
export function csrf(req: Request, res: Response) {
  const token = cookie(req, CSRF_COOKIE) ?? randomToken(24);
  setCsrfCookie(res, token);
  return ok(res, { csrfToken: token });
}

export async function signup(req: Request, res: Response) {
  const input = parse(signupSchema, req.body);
  const session = await auth.signup(input, contextFrom(req));
  applySession(res, session);
  return created(res, { user: session.user }, "Welcome to Meme'd!");
}

export async function login(req: Request, res: Response) {
  const input = parse(loginSchema, req.body);
  const session = await auth.login(input, contextFrom(req));
  applySession(res, session);
  return ok(res, { user: session.user }, "Signed in");
}

export async function refresh(req: Request, res: Response) {
  try {
    const session = await auth.refresh(cookie(req, REFRESH_COOKIE), contextFrom(req));
    applySession(res, session);
    return ok(res, { user: session.user });
  } catch (err) {
    if ((err as { status?: number }).status === 401) clearAuthCookies(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  await auth.logout(cookie(req, REFRESH_COOKIE), req.user?.id ?? null, contextFrom(req));
  clearAuthCookies(res);
  return ok(res, null, "Signed out");
}

export async function logoutAll(req: Request, res: Response) {
  await auth.logoutEverywhere(currentUser(req).id, contextFrom(req));
  clearAuthCookies(res);
  return ok(res, null, "Signed out on every device");
}

/**
 * Non-throwing session probe for the web app: 200 with `user: null` when signed
 * out, so anonymous page loads don't produce 401 noise. `refreshable` tells the
 * client a refresh cookie exists and a silent refresh is worth trying.
 */
export function session(req: Request, res: Response) {
  const user = req.user ?? null;
  return ok(res, { user, refreshable: !user && Boolean(cookie(req, REFRESH_COOKIE)) });
}

export function me(req: Request, res: Response) {
  return ok(res, { user: currentUser(req) });
}

export async function sessions(req: Request, res: Response) {
  const rows = await auth.listActiveSessions(currentUser(req).id);
  return ok(res, {
    sessions: rows.map((s) => ({ id: String(s._id), userAgent: s.userAgent, ip: s.ip, createdAt: s.createdAt, expiresAt: s.expiresAt })),
  });
}
