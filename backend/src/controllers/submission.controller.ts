import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import { applyViewUpdate } from "../services/payout/payout-engine.service";
import * as submissions from "../services/submission.service";
import { contextFrom } from "../types/context";
import { ok } from "../utils/api-response";
import { parse } from "../utils/validate";
import { idParams } from "../validators/common";
import { idempotencyKeyHeader, listSubmissionsQuery, rejectSubmissionSchema, viewUpdateSchema } from "../validators/submission.validators";

export async function mine(req: Request, res: Response) {
  const q = parse(listSubmissionsQuery, req.query);
  const result = await submissions.listMySubmissions(currentUser(req), q);
  return ok(res, { items: result.items }, undefined, 200, result.meta);
}

export async function get(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, { submission: await submissions.getSubmission(currentUser(req), id) });
}

export async function updateViews(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const input = parse(viewUpdateSchema, req.body);
  const rawKey = req.header("idempotency-key");
  const idempotencyKey = rawKey === undefined ? undefined : parse(idempotencyKeyHeader, rawKey);
  const result = await applyViewUpdate({
    submissionId: id,
    views: input.views,
    observedAt: input.observedAt,
    idempotencyKey,
    actor: req.viewUpdateActor ?? "SERVICE",
    ctx: contextFrom(req),
  });
  if (result.idempotentReplay) res.setHeader("Idempotent-Replayed", "true");
  const message =
    result.outcome === "UNCHANGED"
      ? "No change"
      : result.allocation.grantedPaise > 0
        ? result.allocation.partial
          ? "Views recorded; payout partially funded (campaign budget exhausted)"
          : "Views recorded; payout allocated"
        : "Views recorded";
  return ok(res, result, message);
}

export async function reject(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const { reason } = parse(rejectSubmissionSchema, req.body);
  return ok(res, await submissions.rejectSubmission(currentUser(req), id, reason, contextFrom(req)), "Submission rejected");
}

export async function acknowledgeAnomaly(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await submissions.acknowledgeAnomaly(currentUser(req), id, contextFrom(req)), "Marked as reviewed");
}
