import type { Response } from "express";

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  success: true;
  data: T;
  message?: string;
  meta?: PageMeta;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
  requestId?: string;
}

export function ok<T>(res: Response, data: T, message?: string, status = 200, meta?: PageMeta): Response {
  const body: ApiSuccess<T> = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T, message?: string): Response {
  return ok(res, data, message, 201);
}

export function pageMeta(page: number, pageSize: number, total: number): PageMeta {
  return { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
