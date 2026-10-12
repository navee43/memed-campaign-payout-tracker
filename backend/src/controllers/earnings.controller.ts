import type { Request, Response } from "express";
import { z } from "zod";
import { currentUser } from "../middleware/auth";
import * as earnings from "../services/earnings.service";
import { ok } from "../utils/api-response";
import { paginationSchema } from "../utils/pagination";
import { parse } from "../utils/validate";

const historyQuery = paginationSchema.extend({ days: z.coerce.number().int().min(1).max(365).default(30) }).strict();

export async function summary(req: Request, res: Response) {
  return ok(res, await earnings.getEarningsSummary(currentUser(req)));
}

export async function history(req: Request, res: Response) {
  const q = parse(historyQuery, req.query);
  const result = await earnings.getEarningsHistory(currentUser(req), q);
  return ok(res, { items: result.items, daily: result.daily }, undefined, 200, result.meta);
}
