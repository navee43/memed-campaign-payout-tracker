import type { CookieOptions, Response } from "express";
import { env } from "../config/env";

export const ACCESS_COOKIE = "memed_at";
export const REFRESH_COOKIE = "memed_rt";
export const CSRF_COOKIE = "memed_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** The refresh token is only ever sent to the auth endpoints that need it. */
const REFRESH_PATH = "/api/auth";

function base(): CookieOptions {
  const cfg = env();
  return {
    secure: cfg.COOKIE_SECURE,
    sameSite: cfg.COOKIE_SAMESITE,
    domain: cfg.COOKIE_DOMAIN || undefined,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string, refreshExpires: Date): void {
  const cfg = env();
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...base(),
    httpOnly: true,
    path: "/",
    maxAge: cfg.JWT_ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...base(),
    httpOnly: true,
    path: REFRESH_PATH,
    expires: refreshExpires,
  });
}

/** Readable by JS on purpose (double-submit CSRF pattern); carries no authority by itself. */
export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE, token, { ...base(), httpOnly: false, path: "/" });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(), httpOnly: true, path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base(), httpOnly: true, path: REFRESH_PATH });
}
