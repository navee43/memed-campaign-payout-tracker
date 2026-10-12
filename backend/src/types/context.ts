import type { Request } from "express";

/** Request metadata passed from controllers into services (keeps services HTTP-agnostic). */
export interface RequestContext {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
}

export function contextFrom(req: Request): RequestContext {
  return {
    requestId: req.id,
    ip: req.ip ?? null,
    userAgent: req.header("user-agent")?.slice(0, 256) ?? null,
  };
}
