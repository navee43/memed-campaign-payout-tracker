import { Types } from "mongoose";
import { env } from "../config/env";
import { Campaign } from "../models/campaign.model";
import { PayoutLedger } from "../models/payout-ledger.model";
import { Submission } from "../models/submission.model";
import type { RequestContext } from "../types/context";
import type { AuthUser, CampaignStatus, Milestone } from "../types/domain";
import { conflict, notFound } from "../utils/errors";
import { canonicalizeForPlatform } from "../utils/post-url";
import { pageMeta } from "../utils/api-response";
import { skipFor, type Pagination } from "../utils/pagination";
import type { ListSubmissionsQuery } from "../validators/submission.validators";
import { recordAudit } from "./audit.service";
import { ensureOwnedCampaign } from "./campaign.service";
import { runInTransaction } from "./payout/transaction";
import { presentSubmission, submissionWindow } from "./presenters";

type PopulatedCampaign = { _id: Types.ObjectId; name: string; status: CampaignStatus; milestones: Milestone[] };
type PopulatedCreator = { _id: Types.ObjectId; name: string };

export async function createSubmission(user: AuthUser, campaignId: string, postUrl: string, ctx: RequestContext) {
  if (!Types.ObjectId.isValid(campaignId)) throw notFound("Campaign");
  const campaign = await Campaign.findOne({ _id: campaignId, status: { $ne: "DRAFT" } });
  if (!campaign) throw notFound("Campaign");

  const window = submissionWindow(campaign);
  if (!window.open) throw conflict("SUBMISSIONS_CLOSED", window.reason);

  // Pure string checks only — the URL is never fetched (no SSRF surface).
  const post = canonicalizeForPlatform(postUrl, campaign.platform);
  const creatorId = new Types.ObjectId(user.id);

  const existing = await Submission.findOne({ campaignId: campaign._id, canonicalUrl: post.canonicalUrl }, { creatorId: 1 }).lean();
  if (existing) throw duplicateError(String(existing.creatorId) === user.id);

  const mine = await Submission.countDocuments({ campaignId: campaign._id, creatorId });
  if (mine >= env().MAX_SUBMISSIONS_PER_CREATOR_PER_CAMPAIGN) {
    throw conflict("SUBMISSION_LIMIT", `You can submit up to ${env().MAX_SUBMISSIONS_PER_CREATOR_PER_CAMPAIGN} posts to one campaign.`);
  }

  const now = new Date();
  let created;
  try {
    created = await runInTransaction(
      async (session) => {
        const [doc] = await Submission.create(
          [
            {
              campaignId: campaign._id,
              creatorId,
              brandId: campaign.ownerId,
              platform: post.platform,
              postId: post.postId,
              canonicalUrl: post.canonicalUrl,
              originalUrl: postUrl.trim(),
              viewHistory: [{ views: 0, observedAt: now, recordedAt: now }],
            },
          ],
          { session },
        );
        await Campaign.updateOne({ _id: campaign._id }, { $inc: { submissionCount: 1 } }, { session });
        await recordAudit(
          { action: "SUBMISSION_CREATED", actorType: "USER", actorId: user.id, targetType: "Submission", targetId: String(doc!._id), metadata: { campaignId, canonicalUrl: post.canonicalUrl } },
          ctx,
          session,
        );
        return doc!;
      },
      { label: "create-submission" },
    );
  } catch (err) {
    // The unique (campaignId, canonicalUrl) index is the real guard against races.
    if ((err as { code?: number }).code === 11000) {
      const winner = await Submission.findOne({ campaignId: campaign._id, canonicalUrl: post.canonicalUrl }, { creatorId: 1 }).lean();
      throw duplicateError(winner ? String(winner.creatorId) === user.id : false);
    }
    throw err;
  }
  return presentSubmission({ ...created.toObject(), creatorId: { _id: creatorId, name: user.name } }, campaign.milestones as Milestone[], {
    campaign: { id: String(campaign._id), name: campaign.name, status: campaign.status },
  });
}

function duplicateError(sameCreator: boolean) {
  return sameCreator
    ? conflict("DUPLICATE_SUBMISSION", "You've already submitted this post to this campaign.")
    : conflict("POST_ALREADY_CLAIMED", "This post has already been submitted to this campaign.");
}

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  views: { currentViews: -1, _id: -1 },
  earnings: { allocatedPaise: -1, _id: -1 },
} as const;

function listFilter(q: ListSubmissionsQuery): Record<string, unknown> {
  const f: Record<string, unknown> = {};
  if (q.fundingStatus) f.fundingStatus = q.fundingStatus;
  if (q.flagged !== undefined) f["anomaly.flagged"] = q.flagged ? true : { $ne: true };
  return f;
}

export async function listMySubmissions(user: AuthUser, q: ListSubmissionsQuery) {
  const filter = {
    creatorId: new Types.ObjectId(user.id),
    ...listFilter(q),
    ...(q.campaignId ? { campaignId: new Types.ObjectId(q.campaignId) } : {}),
  };
  const [rows, total] = await Promise.all([
    Submission.find(filter, { viewHistory: 0 })
      .sort(SORTS[q.sort])
      .skip(skipFor(q))
      .limit(q.pageSize)
      .populate<{ campaignId: PopulatedCampaign }>("campaignId", "name status milestones"),
    Submission.countDocuments(filter),
  ]);
  return {
    items: rows.map((r) => {
      const c = r.campaignId;
      return presentSubmission({ ...r.toObject(), campaignId: c._id, creatorId: { _id: r.creatorId, name: user.name } }, c.milestones, {
        campaign: { id: String(c._id), name: c.name, status: c.status },
      });
    }),
    meta: pageMeta(q.page, q.pageSize, total),
  };
}

export async function listCampaignSubmissions(user: AuthUser, campaignId: string, q: ListSubmissionsQuery) {
  const campaign = await ensureOwnedCampaign(user, campaignId);
  const filter = { campaignId: campaign._id, ...listFilter(q) };
  const [rows, total] = await Promise.all([
    Submission.find(filter, { viewHistory: 0 })
      .sort(SORTS[q.sort])
      .skip(skipFor(q))
      .limit(q.pageSize)
      .populate<{ creatorId: PopulatedCreator }>("creatorId", "name"),
    Submission.countDocuments(filter),
  ]);
  const milestones = campaign.milestones as Milestone[];
  return { items: rows.map((r) => presentSubmission(r.toObject(), milestones)), meta: pageMeta(q.page, q.pageSize, total) };
}

/** Visible to the creator who submitted it and to the brand that owns the campaign. */
export async function getSubmission(user: AuthUser, id: string) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Submission");
  const owner = user.role === "CREATOR" ? { creatorId: new Types.ObjectId(user.id) } : { brandId: new Types.ObjectId(user.id) };
  const sub = await Submission.findOne({ _id: id, ...owner })
    .populate<{ campaignId: PopulatedCampaign }>("campaignId", "name status milestones")
    .populate<{ creatorId: PopulatedCreator }>("creatorId", "name");
  if (!sub) throw notFound("Submission");
  const c = sub.campaignId;
  const ledger = await PayoutLedger.find({ submissionId: sub._id }, { amountPaise: 1, type: 1, createdAt: 1, viewsAtAllocation: 1, partial: 1, sequence: 1 })
    .sort({ sequence: 1 })
    .lean();
  return {
    ...presentSubmission({ ...sub.toObject(), campaignId: c._id }, c.milestones, {
      includeHistory: true,
      campaign: { id: String(c._id), name: c.name, status: c.status },
    }),
    milestones: c.milestones.map((m) => ({ views: m.views, payoutPaise: m.payoutPaise })),
    ledger: ledger.map((l) => ({
      id: String(l._id),
      sequence: l.sequence,
      type: l.type,
      amountPaise: l.amountPaise,
      viewsAtAllocation: l.viewsAtAllocation,
      partial: l.partial,
      createdAt: l.createdAt,
    })),
  };
}

/**
 * A brand may reject an off-brief submission only while nothing has been
 * allocated to it. Reversing allocated money would need a separate, audited
 * correction workflow (deliberately not exposed to ordinary users).
 */
export async function rejectSubmission(user: AuthUser, id: string, reason: string, ctx: RequestContext) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Submission");
  const brandId = new Types.ObjectId(user.id);
  const updated = await Submission.findOneAndUpdate(
    { _id: id, brandId, status: "ACTIVE", allocatedPaise: 0 },
    { $set: { status: "REJECTED", rejectedReason: reason, rejectedAt: new Date(), underfundedSince: null } },
    { new: true },
  );
  if (!updated) {
    const exists = await Submission.findOne({ _id: id, brandId }, { status: 1, allocatedPaise: 1 }).lean();
    if (!exists) throw notFound("Submission");
    if (exists.status === "REJECTED") throw conflict("ALREADY_REJECTED", "This submission is already rejected.");
    throw conflict("HAS_ALLOCATIONS", "This submission has already earned allocations, so it can't be rejected here.");
  }
  await recordAudit({ action: "SUBMISSION_REJECTED", actorType: "USER", actorId: user.id, targetType: "Submission", targetId: id, metadata: { reason } }, ctx);
  return { id, status: updated.status, rejectedReason: updated.rejectedReason };
}

/** Marks a view-spike flag as reviewed. The flag and its history stay visible. */
export async function acknowledgeAnomaly(user: AuthUser, id: string, ctx: RequestContext) {
  if (!Types.ObjectId.isValid(id)) throw notFound("Submission");
  const updated = await Submission.findOneAndUpdate(
    { _id: id, brandId: new Types.ObjectId(user.id), "anomaly.flagged": true },
    { $set: { "anomaly.reviewedAt": new Date(), "anomaly.reviewedBy": new Types.ObjectId(user.id) } },
    { new: true },
  );
  if (!updated) throw notFound("Flagged submission");
  await recordAudit({ action: "ANOMALY_REVIEWED", actorType: "USER", actorId: user.id, targetType: "Submission", targetId: id }, ctx);
  return { id, anomaly: { flagged: true, reviewedAt: updated.anomaly?.reviewedAt ?? null } };
}

export async function getCampaignLedger(user: AuthUser, campaignId: string, q: Pagination) {
  const campaign = await ensureOwnedCampaign(user, campaignId);
  const filter = { campaignId: campaign._id };
  const [rows, total] = await Promise.all([
    PayoutLedger.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(q))
      .limit(q.pageSize)
      .populate<{ creatorId: PopulatedCreator }>("creatorId", "name")
      .populate<{ submissionId: { _id: Types.ObjectId; canonicalUrl: string } }>("submissionId", "canonicalUrl")
      .lean(),
    PayoutLedger.countDocuments(filter),
  ]);
  return {
    items: rows.map((l) => ({
      id: String(l._id),
      allocationKey: l.allocationKey,
      type: l.type,
      amountPaise: l.amountPaise,
      partial: l.partial,
      submissionId: String(l.submissionId._id),
      postUrl: l.submissionId.canonicalUrl,
      creatorName: l.creatorId.name,
      viewsAtAllocation: l.viewsAtAllocation,
      eligiblePaiseAfter: l.eligiblePaiseAfter,
      allocatedPaiseAfter: l.allocatedPaiseAfter,
      campaignAllocatedPaiseAfter: l.campaignAllocatedPaiseAfter,
      sourceEventId: l.sourceEventId,
      createdAt: l.createdAt,
    })),
    meta: pageMeta(q.page, q.pageSize, total),
  };
}
