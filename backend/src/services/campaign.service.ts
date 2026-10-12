import { Types } from "mongoose";
import { Campaign } from "../models/campaign.model";
import { PayoutLedger } from "../models/payout-ledger.model";
import { Submission } from "../models/submission.model";
import { findCampaigns, findOwnedCampaign, findVisibleCampaign } from "../repositories/campaign.repository";
import type { RequestContext } from "../types/context";
import type { AuthUser, CampaignStatus, Milestone } from "../types/domain";
import { AppError, conflict, notFound, validationError } from "../utils/errors";
import { MAX_PAISE } from "../utils/money";
import { pageMeta, type PageMeta } from "../utils/api-response";
import type { CreateCampaignInput, ListCampaignsQuery, UpdateCampaignInput } from "../validators/campaign.validators";
import { recordAudit } from "./audit.service";
import { invalidateCampaignLists, readCampaignList, writeCampaignList, type CacheStatus } from "./cache/campaign-cache";
import { getMilestoneLadderIssues, maxPayoutPaise } from "./payout/payout-calculator";
import { allocateFromQueue, checkCampaignIntegrity } from "./payout/payout-engine.service";
import { runInTransaction } from "./payout/transaction";
import { budgetSummary, presentCampaign, presentSubmission, type CampaignView } from "./presenters";

/** Status machine. COMPLETED is terminal; a draft can only be published. */
const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["LIVE"],
  LIVE: ["PAUSED", "COMPLETED"],
  PAUSED: ["LIVE", "COMPLETED"],
  COMPLETED: [],
};

/** Fields a brand may edit after publication. Money terms are frozen: creators rely on them. */
const EDITABLE_AFTER_PUBLISH = new Set(["name", "description", "coverImageUrl", "coverTheme", "endsAt", "status"]);

export async function createCampaign(user: AuthUser, input: CreateCampaignInput, ctx: RequestContext): Promise<CampaignView> {
  const now = new Date();
  if (input.status === "LIVE" && input.endsAt && input.endsAt.getTime() <= now.getTime()) {
    throw validationError("A live campaign's end date must be in the future.");
  }
  const campaign = await Campaign.create({
    ownerId: new Types.ObjectId(user.id),
    name: input.name,
    description: input.description,
    platform: input.platform,
    budgetPaise: input.budgetPaise,
    milestones: input.milestones,
    status: input.status,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    coverTheme: input.coverTheme ?? 0,
    publishedAt: input.status === "LIVE" ? now : null,
  });
  await recordAudit(
    {
      action: "CAMPAIGN_CREATED",
      actorType: "USER",
      actorId: user.id,
      targetType: "Campaign",
      targetId: String(campaign._id),
      metadata: { status: campaign.status, budgetPaise: campaign.budgetPaise },
    },
    ctx,
  );
  if (campaign.status === "LIVE") await invalidateCampaignLists();
  return presentCampaign({ ...campaign.toObject(), ownerId: { _id: campaign.ownerId, name: user.name } });
}

export interface CampaignListResult {
  items: CampaignView[];
  meta: PageMeta;
  cache: CacheStatus;
}

/**
 * Brands see their own campaigns (every status). Creators see the discovery
 * feed of live campaigns, served from Redis when possible.
 */
export async function listCampaigns(user: AuthUser, q: ListCampaignsQuery): Promise<CampaignListResult> {
  if (user.role === "BRAND") {
    const { rows, total } = await findCampaigns({ ownerId: user.id }, q);
    return { items: rows.map((r) => presentCampaign(r)), meta: pageMeta(q.page, q.pageSize, total), cache: "BYPASS" };
  }

  const cacheQuery = { scope: "discover", ...q };
  const cached = await readCampaignList<{ items: CampaignView[]; meta: PageMeta }>(cacheQuery);
  if (cached.status === "HIT" && cached.value) return { ...cached.value, cache: "HIT" };

  const { rows, total } = await findCampaigns({ statuses: ["LIVE"] }, { ...q, status: "LIVE" });
  const value = { items: rows.map((r) => presentCampaign(r)), meta: pageMeta(q.page, q.pageSize, total) };
  await writeCampaignList(cached.key, value);
  return { ...value, cache: cached.status };
}

export async function getCampaign(user: AuthUser, id: string): Promise<CampaignView> {
  if (user.role === "BRAND") {
    const c = await findOwnedCampaign(id, user.id);
    if (!c) throw notFound("Campaign");
    return presentCampaign({ ...c.toObject(), ownerId: { _id: c.ownerId, name: user.name } });
  }
  const c = await findVisibleCampaign(id);
  if (!c) throw notFound("Campaign");
  return presentCampaign(c.toObject());
}

export async function updateCampaign(user: AuthUser, id: string, patch: UpdateCampaignInput, ctx: RequestContext): Promise<CampaignView> {
  const current = await findOwnedCampaign(id, user.id);
  if (!current) throw notFound("Campaign");
  const now = new Date();

  if (current.status === "COMPLETED") {
    throw conflict("CAMPAIGN_COMPLETED", "Completed campaigns can no longer be edited.");
  }
  if (current.status !== "DRAFT") {
    const locked = Object.keys(patch).filter((k) => !EDITABLE_AFTER_PUBLISH.has(k));
    if (locked.length > 0) {
      throw conflict(
        "FIELDS_LOCKED",
        `These fields are locked once a campaign is published: ${locked.join(", ")}. Use a budget top-up to add funds.`,
        { locked },
      );
    }
  }

  const nextStatus = patch.status ?? current.status;
  if (patch.status && patch.status !== current.status && !TRANSITIONS[current.status].includes(patch.status)) {
    throw conflict("INVALID_STATUS_TRANSITION", `A ${current.status.toLowerCase()} campaign cannot become ${patch.status.toLowerCase()}.`);
  }

  // Validate the merged result, not just the patch.
  const milestones = (patch.milestones ?? current.milestones) as Milestone[];
  const budgetPaise = patch.budgetPaise ?? current.budgetPaise;
  const ladderIssues = getMilestoneLadderIssues(milestones);
  if (ladderIssues.length > 0) throw new AppError(422, "INVALID_MILESTONES", ladderIssues.join("; "), ladderIssues);
  if (maxPayoutPaise(milestones) > budgetPaise) {
    throw validationError("Budget must be at least the highest milestone payout.");
  }
  const startsAt = patch.startsAt !== undefined ? patch.startsAt : current.startsAt;
  const endsAt = patch.endsAt !== undefined ? patch.endsAt : current.endsAt;
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) {
    throw validationError("End date must be after the start date.");
  }
  if (nextStatus === "LIVE" && endsAt && endsAt.getTime() <= now.getTime()) {
    throw validationError("Set an end date in the future before going live.");
  }

  const set: Record<string, unknown> = {};
  for (const key of ["name", "description", "platform", "budgetPaise", "milestones", "coverImageUrl", "coverTheme"] as const) {
    if (patch[key] !== undefined) set[key] = patch[key];
  }
  if (patch.startsAt !== undefined) set.startsAt = patch.startsAt;
  if (patch.endsAt !== undefined) set.endsAt = patch.endsAt;
  if (patch.status && patch.status !== current.status) {
    set.status = patch.status;
    if (patch.status === "LIVE" && !current.publishedAt) set.publishedAt = now;
    if (patch.status === "PAUSED") set.pausedAt = now;
    if (patch.status === "COMPLETED") set.completedAt = now;
  }

  // Conditional on the status we validated against, so a concurrent status change can't be overwritten.
  const updated = await Campaign.findOneAndUpdate(
    { _id: current._id, ownerId: current.ownerId, status: current.status },
    { $set: set },
    { new: true, runValidators: true },
  );
  if (!updated) throw conflict("CAMPAIGN_CHANGED", "The campaign changed while you were editing. Please reload and try again.");

  await recordAudit(
    {
      action: set.status ? "CAMPAIGN_STATUS_CHANGED" : "CAMPAIGN_UPDATED",
      actorType: "USER",
      actorId: user.id,
      targetType: "Campaign",
      targetId: id,
      metadata: { fields: Object.keys(set), from: current.status, to: updated.status },
    },
    ctx,
  );
  await invalidateCampaignLists();
  return presentCampaign({ ...updated.toObject(), ownerId: { _id: updated.ownerId, name: user.name } });
}

/**
 * Budget top-up — the only way to change a published campaign's budget.
 * Budgets can grow but never shrink once creators may have earned against
 * them. The top-up and the back-fill of under-funded submissions commit in the
 * same transaction, so queued creators are paid (oldest first) before any new
 * view update can claim the new money.
 */
export async function topUpBudget(user: AuthUser, id: string, amountPaise: number, ctx: RequestContext) {
  const owned = await findOwnedCampaign(id, user.id);
  if (!owned) throw notFound("Campaign");
  if (owned.status === "COMPLETED") throw conflict("CAMPAIGN_COMPLETED", "Completed campaigns can't be topped up.");

  const outcome = await runInTransaction(
    async (session) => {
      const updated = await Campaign.findOneAndUpdate(
        {
          _id: owned._id,
          ownerId: owned.ownerId,
          status: { $in: ["DRAFT", "LIVE", "PAUSED"] },
          $expr: { $lte: [{ $add: ["$budgetPaise", amountPaise] }, MAX_PAISE] },
        },
        { $inc: { budgetPaise: amountPaise }, $set: { budgetExhaustedAt: null } },
        { session, new: true },
      );
      if (!updated) throw conflict("TOP_UP_REJECTED", "This top-up isn't possible for the campaign's current state.");
      const backfill = await allocateFromQueue(updated._id, session, `topup:${ctx.requestId}`);
      await recordAudit(
        {
          action: "CAMPAIGN_BUDGET_TOPPED_UP",
          actorType: "USER",
          actorId: user.id,
          targetType: "Campaign",
          targetId: id,
          metadata: { amountPaise, newBudgetPaise: updated.budgetPaise, backfilledPaise: backfill.allocatedPaise, submissionsFunded: backfill.submissionsFunded },
        },
        ctx,
        session,
      );
      return backfill;
    },
    { label: "top-up" },
  );
  await invalidateCampaignLists();
  const fresh = await findOwnedCampaign(id, user.id);
  return {
    campaign: presentCampaign({ ...fresh!.toObject(), ownerId: { _id: fresh!.ownerId, name: user.name } }),
    reconciliation: outcome,
  };
}

export async function getCampaignAnalytics(user: AuthUser, id: string) {
  const campaign = await findOwnedCampaign(id, user.id);
  if (!campaign) throw notFound("Campaign");
  const cid = campaign._id;
  const since = new Date(Date.now() - 30 * 86_400_000);

  const [stats, byFunding, byMilestone, daily, topSubs, integrity] = await Promise.all([
    Submission.aggregate<{ count: number; totalViews: number; eligible: number; allocated: number; flagged: number; unreviewedFlags: number }>([
      { $match: { campaignId: cid } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalViews: { $sum: "$currentViews" },
          eligible: { $sum: "$eligiblePaise" },
          allocated: { $sum: "$allocatedPaise" },
          flagged: { $sum: { $cond: ["$anomaly.flagged", 1, 0] } },
          unreviewedFlags: {
            $sum: { $cond: [{ $and: ["$anomaly.flagged", { $eq: [{ $ifNull: ["$anomaly.reviewedAt", null] }, null] }] }, 1, 0] },
          },
        },
      },
    ]),
    Submission.aggregate<{ _id: string; count: number }>([{ $match: { campaignId: cid } }, { $group: { _id: "$fundingStatus", count: { $sum: 1 } } }]),
    Submission.aggregate<{ _id: number; count: number }>([{ $match: { campaignId: cid } }, { $group: { _id: "$highestMilestoneIndex", count: { $sum: 1 } } }]),
    PayoutLedger.aggregate<{ _id: string; amountPaise: number; entries: number }>([
      { $match: { campaignId: cid, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, amountPaise: { $sum: "$amountPaise" }, entries: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Submission.find({ campaignId: cid }).sort({ currentViews: -1, _id: 1 }).limit(5).populate<{ creatorId: { _id: Types.ObjectId; name: string } }>("creatorId", "name"),
    checkCampaignIntegrity(String(cid)),
  ]);

  const s = stats[0] ?? { count: 0, totalViews: 0, eligible: 0, allocated: 0, flagged: 0, unreviewedFlags: 0 };
  const milestones = campaign.milestones as Milestone[];
  return {
    campaign: presentCampaign({ ...campaign.toObject(), ownerId: { _id: campaign.ownerId, name: user.name } }),
    budget: budgetSummary(campaign),
    totals: {
      submissions: s.count,
      views: s.totalViews,
      eligiblePaise: s.eligible,
      allocatedPaise: s.allocated,
      unfundedEntitlementPaise: Math.max(0, s.eligible - s.allocated),
      flaggedSubmissions: s.flagged,
      unreviewedFlags: s.unreviewedFlags,
    },
    fundingBreakdown: Object.fromEntries(byFunding.map((r) => [r._id, r.count])),
    milestoneDistribution: [
      { label: "Below first milestone", views: 0, payoutPaise: 0, count: byMilestone.find((r) => r._id === -1)?.count ?? 0 },
      ...milestones.map((m, i) => ({ label: `${m.views.toLocaleString("en-IN")}+ views`, views: m.views, payoutPaise: m.payoutPaise, count: byMilestone.find((r) => r._id === i)?.count ?? 0 })),
    ],
    dailyAllocations: daily.map((d) => ({ date: d._id, amountPaise: d.amountPaise, entries: d.entries })),
    topSubmissions: topSubs.map((t) => presentSubmission(t.toObject(), milestones)),
    integrity,
  };
}

export async function ensureOwnedCampaign(user: AuthUser, id: string) {
  const c = await findOwnedCampaign(id, user.id);
  if (!c) throw notFound("Campaign");
  return c;
}

/** Brand home: portfolio totals computed by MongoDB from authoritative fields. */
export async function getBrandSummary(user: AuthUser) {
  const ownerId = new Types.ObjectId(user.id);
  const [byStatus, money, subs, recent, top] = await Promise.all([
    Campaign.aggregate<{ _id: CampaignStatus; count: number }>([{ $match: { ownerId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    Campaign.aggregate<{ budget: number; allocated: number; paid: number }>([
      { $match: { ownerId, status: { $ne: "DRAFT" } } },
      { $group: { _id: null, budget: { $sum: "$budgetPaise" }, allocated: { $sum: "$allocatedPaise" }, paid: { $sum: "$paidPaise" } } },
    ]),
    Submission.aggregate<{ count: number; views: number; unreviewedFlags: number }>([
      { $match: { brandId: ownerId } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          views: { $sum: "$currentViews" },
          unreviewedFlags: {
            $sum: { $cond: [{ $and: ["$anomaly.flagged", { $eq: [{ $ifNull: ["$anomaly.reviewedAt", null] }, null] }] }, 1, 0] },
          },
        },
      },
    ]),
    PayoutLedger.find({ brandId: ownerId })
      .sort({ createdAt: -1, _id: -1 })
      .limit(8)
      .populate<{ creatorId: { _id: Types.ObjectId; name: string } }>("creatorId", "name")
      .populate<{ campaignId: { _id: Types.ObjectId; name: string } }>("campaignId", "name")
      .lean(),
    Campaign.find({ ownerId, status: { $in: ["LIVE", "PAUSED"] } })
      .sort({ allocatedPaise: -1, _id: -1 })
      .limit(8)
      .lean(),
  ]);
  const m = money[0] ?? { budget: 0, allocated: 0, paid: 0 };
  const s = subs[0] ?? { count: 0, views: 0, unreviewedFlags: 0 };
  return {
    campaignsByStatus: Object.fromEntries(byStatus.map((r) => [r._id, r.count])),
    budget: budgetSummary({ budgetPaise: m.budget, allocatedPaise: m.allocated, paidPaise: m.paid }),
    submissions: { count: s.count, views: s.views, unreviewedFlags: s.unreviewedFlags },
    activeCampaigns: top.map((c) => presentCampaign({ ...c, ownerId: { _id: c.ownerId, name: user.name } })),
    recentAllocations: recent.map((l) => ({
      id: String(l._id),
      type: l.type,
      amountPaise: l.amountPaise,
      partial: l.partial,
      campaignId: String(l.campaignId._id),
      campaignName: l.campaignId.name,
      creatorName: l.creatorId.name,
      submissionId: String(l.submissionId),
      createdAt: l.createdAt,
    })),
  };
}
