import type { Request, Response } from "express";
import { currentUser } from "../middleware/auth";
import * as campaigns from "../services/campaign.service";
import { reconcileCampaign } from "../services/payout/payout-engine.service";
import * as submissions from "../services/submission.service";
import { contextFrom } from "../types/context";
import { created, ok } from "../utils/api-response";
import { paginationSchema } from "../utils/pagination";
import { parse } from "../utils/validate";
import { idParams } from "../validators/common";
import { createCampaignSchema, listCampaignsQuery, topUpSchema, updateCampaignSchema } from "../validators/campaign.validators";
import { createSubmissionSchema, listSubmissionsQuery } from "../validators/submission.validators";

export async function create(req: Request, res: Response) {
  const input = parse(createCampaignSchema, req.body);
  const campaign = await campaigns.createCampaign(currentUser(req), input, contextFrom(req));
  return created(res, { campaign }, campaign.status === "LIVE" ? "Campaign is live" : "Draft saved");
}

export async function brandSummary(req: Request, res: Response) {
  return ok(res, await campaigns.getBrandSummary(currentUser(req)));
}

export async function list(req: Request, res: Response) {
  const q = parse(listCampaignsQuery, req.query);
  const result = await campaigns.listCampaigns(currentUser(req), q);
  res.setHeader("X-Cache", result.cache);
  return ok(res, { items: result.items }, undefined, 200, result.meta);
}

export async function get(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, { campaign: await campaigns.getCampaign(currentUser(req), id) });
}

export async function update(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const patch = parse(updateCampaignSchema, req.body);
  const campaign = await campaigns.updateCampaign(currentUser(req), id, patch, contextFrom(req));
  return ok(res, { campaign }, "Campaign updated");
}

export async function topUp(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const { amountPaise } = parse(topUpSchema, req.body);
  const result = await campaigns.topUpBudget(currentUser(req), id, amountPaise, contextFrom(req));
  return ok(res, result, "Budget topped up");
}

export async function reconcile(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  await campaigns.ensureOwnedCampaign(currentUser(req), id);
  const outcome = await reconcileCampaign(id, `manual:${req.id}`);
  return ok(res, { reconciliation: outcome }, outcome.allocatedPaise > 0 ? "Under-funded submissions were back-filled" : "Nothing to reconcile");
}

export async function analytics(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  return ok(res, await campaigns.getCampaignAnalytics(currentUser(req), id));
}

export async function listSubmissions(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const q = parse(listSubmissionsQuery, req.query);
  const result = await submissions.listCampaignSubmissions(currentUser(req), id, q);
  return ok(res, { items: result.items }, undefined, 200, result.meta);
}

export async function submit(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const { postUrl } = parse(createSubmissionSchema, req.body);
  const submission = await submissions.createSubmission(currentUser(req), id, postUrl, contextFrom(req));
  return created(res, { submission }, "Post submitted");
}

export async function ledger(req: Request, res: Response) {
  const { id } = parse(idParams, req.params);
  const q = parse(paginationSchema, req.query);
  const result = await submissions.getCampaignLedger(currentUser(req), id, q);
  return ok(res, { items: result.items }, undefined, 200, result.meta);
}
