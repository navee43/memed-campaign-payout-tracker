import { randomUUID } from "node:crypto";
import { Types } from "mongoose";
import { env } from "../../config/env";
import { RefreshSession } from "../../models/refresh-session.model";
import { User, type UserDoc } from "../../models/user.model";
import type { RequestContext } from "../../types/context";
import type { AuthUser, Role } from "../../types/domain";
import { AppError, conflict, unauthorized } from "../../utils/errors";
import { randomToken, sha256 } from "../../utils/crypto";
import { recordAudit } from "../audit.service";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";
import { signAccessToken } from "./token.service";

export interface IssuedSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  csrfToken: string;
}

export function toAuthUser(u: { _id: Types.ObjectId | string; role: Role; name: string; email: string }): AuthUser {
  return { id: String(u._id), role: u.role, name: u.name, email: u.email };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function issueSession(
  user: Pick<UserDoc, "_id" | "role" | "name" | "email" | "tokenVersion">,
  ctx: RequestContext,
  familyId: string = randomUUID(),
): Promise<IssuedSession> {
  const cfg = env();
  const refreshToken = randomToken(48);
  const refreshExpiresAt = new Date(Date.now() + cfg.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await RefreshSession.create({
    userId: user._id,
    familyId,
    tokenHash: sha256(refreshToken),
    expiresAt: refreshExpiresAt,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });
  return {
    user: toAuthUser(user),
    accessToken: signAccessToken({ sub: String(user._id), role: user.role, tv: user.tokenVersion ?? 0 }),
    refreshToken,
    refreshExpiresAt,
    csrfToken: randomToken(24),
  };
}

export async function signup(
  input: { name: string; email: string; password: string; role: Role },
  ctx: RequestContext,
): Promise<IssuedSession> {
  const email = normalizeEmail(input.email);
  const passwordHash = await hashPassword(input.password);
  let user: UserDoc;
  try {
    user = await User.create({ name: input.name.trim(), email, passwordHash, role: input.role });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      throw conflict("EMAIL_TAKEN", "An account with this email already exists. Try signing in instead.");
    }
    throw err;
  }
  await recordAudit({ action: "USER_SIGNED_UP", actorType: "USER", actorId: String(user._id), targetType: "User", targetId: String(user._id), metadata: { role: user.role } }, ctx);
  return issueSession(user, ctx);
}

const INVALID_CREDENTIALS = () => new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");

export async function login(input: { email: string; password: string }, ctx: RequestContext): Promise<IssuedSession> {
  const cfg = env();
  const email = normalizeEmail(input.email);
  const user = await User.findOne({ email }).select("+passwordHash +failedLoginAttempts +lockedUntil");
  if (!user) {
    await burnPasswordCheck(input.password);
    throw INVALID_CREDENTIALS();
  }

  const now = Date.now();
  if (user.lockedUntil && user.lockedUntil.getTime() > now) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - now) / 60_000);
    throw new AppError(429, "ACCOUNT_LOCKED", `Too many failed sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }

  const valid = await verifyPassword(user.passwordHash, input.password);
  if (!valid) {
    // Atomic increment so parallel guesses can't race past the limit.
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $inc: { failedLoginAttempts: 1 } },
      { new: true, projection: { failedLoginAttempts: 1 } },
    ).select("+failedLoginAttempts");
    if ((updated?.failedLoginAttempts ?? 0) >= cfg.LOGIN_MAX_FAILED_ATTEMPTS) {
      await User.updateOne(
        { _id: user._id },
        { $set: { lockedUntil: new Date(now + cfg.LOGIN_LOCKOUT_MINUTES * 60_000), failedLoginAttempts: 0 } },
      );
      await recordAudit({ action: "ACCOUNT_LOCKED", actorType: "SYSTEM", targetType: "User", targetId: String(user._id) }, ctx);
    }
    throw INVALID_CREDENTIALS();
  }

  if (user.status !== "ACTIVE") {
    throw new AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended. Please contact support.");
  }

  await User.updateOne({ _id: user._id }, { $set: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await recordAudit({ action: "USER_LOGGED_IN", actorType: "USER", actorId: String(user._id), targetType: "User", targetId: String(user._id) }, ctx);
  return issueSession(user, ctx);
}

/**
 * Refresh-token rotation with reuse detection.
 *  - valid, unrotated token  -> rotate: mark used, issue a new token in the same family
 *  - token rotated seconds ago -> concurrent refresh from another tab: 409, no revocation
 *  - token rotated earlier     -> likely stolen and replayed: revoke the whole family
 */
export async function refresh(rawToken: string | undefined, ctx: RequestContext): Promise<IssuedSession> {
  if (!rawToken) throw unauthorized("Your session has ended. Please sign in again.");
  const cfg = env();
  const now = new Date();
  const session = await RefreshSession.findOne({ tokenHash: sha256(rawToken) });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
    throw unauthorized("Your session has ended. Please sign in again.");
  }

  if (session.rotatedAt) {
    const ageMs = now.getTime() - session.rotatedAt.getTime();
    if (ageMs <= cfg.REFRESH_REUSE_GRACE_SECONDS * 1000) {
      throw conflict("REFRESH_IN_PROGRESS", "Session is being refreshed. Please retry.");
    }
    await RefreshSession.updateMany(
      { familyId: session.familyId, revokedAt: null },
      { $set: { revokedAt: now, revokedReason: "reuse_detected" } },
    );
    await recordAudit({ action: "REFRESH_TOKEN_REUSE", actorType: "SYSTEM", targetType: "User", targetId: String(session.userId), metadata: { familyId: session.familyId } }, ctx);
    throw unauthorized("Your session has ended. Please sign in again.");
  }

  // Claim the token atomically; a concurrent request that loses gets 409.
  const claimed = await RefreshSession.findOneAndUpdate(
    { _id: session._id, rotatedAt: null, revokedAt: null },
    { $set: { rotatedAt: now } },
  );
  if (!claimed) throw conflict("REFRESH_IN_PROGRESS", "Session is being refreshed. Please retry.");

  const user = await User.findById(session.userId);
  if (!user || user.status !== "ACTIVE") {
    throw unauthorized("Your session has ended. Please sign in again.");
  }
  return issueSession(user, ctx, session.familyId);
}

export async function logout(rawToken: string | undefined, userId: string | null, ctx: RequestContext): Promise<void> {
  if (rawToken) {
    await RefreshSession.updateOne(
      { tokenHash: sha256(rawToken), revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: "logout" } },
    );
  }
  if (userId) {
    await recordAudit({ action: "USER_LOGGED_OUT", actorType: "USER", actorId: userId, targetType: "User", targetId: userId }, ctx);
  }
}

/** Revokes every refresh session and invalidates outstanding access tokens immediately. */
export async function logoutEverywhere(userId: string, ctx: RequestContext): Promise<void> {
  await RefreshSession.updateMany(
    { userId: new Types.ObjectId(userId), revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "logout_all" } },
  );
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await recordAudit({ action: "USER_LOGGED_OUT_EVERYWHERE", actorType: "USER", actorId: userId, targetType: "User", targetId: userId }, ctx);
}

export async function listActiveSessions(userId: string) {
  return RefreshSession.find(
    { userId: new Types.ObjectId(userId), revokedAt: null, rotatedAt: null, expiresAt: { $gt: new Date() } },
    { userAgent: 1, ip: 1, createdAt: 1, expiresAt: 1 },
  )
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}

export async function getUser(userId: string): Promise<AuthUser | null> {
  const u = await User.findById(userId, { name: 1, email: 1, role: 1 }).lean();
  return u ? toAuthUser(u) : null;
}
