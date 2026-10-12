import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { logger } from "../config/logger";
import { AppError } from "../utils/errors";
import type { ApiFailure } from "../utils/api-response";
import { PostUrlError } from "../utils/post-url";
import { InvalidMilestoneLadderError, InvalidViewsError } from "../services/payout/payout-calculator";

interface HttpishError {
  status?: number;
  statusCode?: number;
  type?: string;
  code?: number | string;
}

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError(
      422,
      "VALIDATION_ERROR",
      "Some fields are invalid. Please check your input.",
      err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  if (err instanceof PostUrlError) return new AppError(422, "INVALID_POST_URL", err.message);
  if (err instanceof InvalidMilestoneLadderError) return new AppError(422, "INVALID_MILESTONES", err.message, err.issues);
  if (err instanceof InvalidViewsError) return new AppError(422, "INVALID_VIEWS", err.message);
  if (err instanceof mongoose.Error.CastError) return new AppError(404, "NOT_FOUND", "Resource not found.");
  if (err instanceof mongoose.Error.ValidationError) {
    return new AppError(
      422,
      "VALIDATION_ERROR",
      "Some fields are invalid.",
      Object.values(err.errors).map((e) => ({ path: e.path, message: e.message })),
    );
  }
  const e = err as HttpishError;
  if (e?.code === 11000) return new AppError(409, "DUPLICATE", "That record already exists.");
  if (e?.type === "entity.too.large") return new AppError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  if (e?.type === "entity.parse.failed") return new AppError(400, "MALFORMED_JSON", "Request body must be valid JSON.");
  const status = e?.status ?? e?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return new AppError(status, "BAD_REQUEST", "The request could not be processed.");
  }
  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const appErr = toAppError(err);
  if (appErr) {
    if (appErr.status >= 500) logger.error({ err, requestId: req.id }, "request failed");
    else logger.debug({ code: appErr.code, requestId: req.id }, "request rejected");
  } else {
    logger.error({ err, requestId: req.id, path: req.path }, "unhandled error");
  }
  const status = appErr?.status ?? 500;
  const body: ApiFailure = {
    success: false,
    error: {
      code: appErr?.code ?? "INTERNAL_ERROR",
      message: appErr?.message ?? "Something went wrong on our side. Please try again.",
      ...(appErr?.details !== undefined ? { details: appErr.details } : {}),
    },
    requestId: req.id,
  };
  if (res.headersSent) return;
  res.status(status).json(body);
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiFailure = {
    success: false,
    error: { code: "ROUTE_NOT_FOUND", message: `No route for ${req.method} ${req.path}` },
    requestId: req.id,
  };
  res.status(404).json(body);
}
