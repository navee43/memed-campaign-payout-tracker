import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { ROLES, type Role } from "../../types/domain";

export interface AccessClaims {
  sub: string;
  role: Role;
  /** User.tokenVersion at issue time; bumping it invalidates all access tokens. */
  tv: number;
}

export function signAccessToken(claims: AccessClaims): string {
  const cfg = env();
  return jwt.sign({ role: claims.role, tv: claims.tv }, cfg.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    subject: claims.sub,
    expiresIn: cfg.JWT_ACCESS_TTL_SECONDS,
    issuer: cfg.JWT_ISSUER,
    audience: cfg.JWT_AUDIENCE,
  });
}

export type VerifyResult = { ok: true; claims: AccessClaims } | { ok: false; reason: "expired" | "invalid" };

export function verifyAccessToken(token: string): VerifyResult {
  const cfg = env();
  try {
    const payload = jwt.verify(token, cfg.JWT_ACCESS_SECRET, {
      algorithms: ["HS256"],
      issuer: cfg.JWT_ISSUER,
      audience: cfg.JWT_AUDIENCE,
    });
    if (typeof payload === "string") return { ok: false, reason: "invalid" };
    const { sub, role, tv } = payload as { sub?: unknown; role?: unknown; tv?: unknown };
    if (typeof sub !== "string" || typeof tv !== "number" || !ROLES.includes(role as Role)) {
      return { ok: false, reason: "invalid" };
    }
    return { ok: true, claims: { sub, role: role as Role, tv } };
  } catch (err) {
    return { ok: false, reason: err instanceof jwt.TokenExpiredError ? "expired" : "invalid" };
  }
}
