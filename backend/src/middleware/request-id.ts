import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

declare module "express-serve-static-core" {
  interface Request {
    id: string;
  }
}

/** Accepts an upstream X-Request-Id (e.g. from the ALB) if well-formed, otherwise mints one. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header("x-request-id");
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader("X-Request-Id", req.id);
  next();
}
