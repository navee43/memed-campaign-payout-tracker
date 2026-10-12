import { Types } from "mongoose";
import { PayoutLedger } from "../models/payout-ledger.model";
import { Submission } from "../models/submission.model";
import type { AuthUser, CampaignStatus, Milestone } from "../types/domain";
import { pageMeta } from "../utils/api-response";
import { skipFor, type Pagination } from "../utils/pagination";
import { presentSubmission } from "./presenters";

/**
 * Creator earnings, computed by MongoDB aggregation from the authoritative
 * submission and ledger data. The frontend only formats these numbers.
 */
export async function getEarningsSummary(user: AuthUser) {
  const creatorId = new Types.ObjectId(user.id);

  const [totals, byCampaign, top, recent] = await Promise.all([
    Submission.aggregate<{ submissions: number; active: number; views: number; eligible: number; allocated: number; underfunded: number }>([
      { $match: { creatorId } },
      { $lookup: { from: "campaigns", localField: "campaignId", foreignField: "_id", as: "c" } },
      {
        $group: {
          _id: null,
          submissions: { $sum: 1 },
          active: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$status", "ACTIVE"] }, { $in: [{ $arrayElemAt: ["$c.status", 0] }, ["LIVE", "PAUSED"]] }] },
                1,
                0,
              ],
            },
          },
          views: { $sum: "$currentViews" },
          eligible: { $sum: "$eligiblePaise" },
          allocated: { $sum: "$allocatedPaise" },
          underfunded: { $sum: { $cond: [{ $gt: ["$eligiblePaise", "$allocatedPaise"] }, 1, 0] } },
        },
      },
    ]),
    Submission.aggregate<{ _id: Types.ObjectId; name: string; status: CampaignStatus; submissions: number; views: number; eligible: number; allocated: number }>([
      { $match: { creatorId } },
      {
        $group: {
          _id: "$campaignId",
          submissions: { $sum: 1 },
          views: { $sum: "$currentViews" },
          eligible: { $sum: "$eligiblePaise" },
          allocated: { $sum: "$allocatedPaise" },
        },
      },
      { $lookup: { from: "campaigns", localField: "_id", foreignField: "_id", as: "c" } },
      { $addFields: { name: { $arrayElemAt: ["$c.name", 0] }, status: { $arrayElemAt: ["$c.status", 0] } } },
      { $project: { c: 0 } },
      { $sort: { allocated: -1, views: -1 } },
      { $limit: 50 },
    ]),
    Submission.find({ creatorId }, { viewHistory: 0 })
      .sort({ currentViews: -1, allocatedPaise: -1, _id: 1 })
      .limit(1)
      .populate<{ campaignId: { _id: Types.ObjectId; name: string; status: CampaignStatus; milestones: Milestone[] } }>("campaignId", "name status milestones"),
    recentActivity(creatorId, 8),
  ]);

  const t = totals[0] ?? { submissions: 0, active: 0, views: 0, eligible: 0, allocated: 0, underfunded: 0 };
  const best = top[0];
  return {
    totals: {
      submissions: t.submissions,
      activeSubmissions: t.active,
      views: t.views,
      /** What the milestone ladders entitle the creator to. */
      eligiblePaise: t.eligible,
      /** Reserved from campaign budgets — accrued earnings. */
      allocatedPaise: t.allocated,
      /** Disbursed to a bank account. Not implemented in this release, so always 0. */
      paidPaise: 0,
      awaitingBudgetPaise: Math.max(0, t.eligible - t.allocated),
      underfundedSubmissions: t.underfunded,
    },
    byCampaign: byCampaign.map((c) => ({
      campaignId: String(c._id),
      name: c.name,
      status: c.status,
      submissions: c.submissions,
      views: c.views,
      eligiblePaise: c.eligible,
      allocatedPaise: c.allocated,
    })),
    topSubmission: best
      ? presentSubmission({ ...best.toObject(), campaignId: best.campaignId._id, creatorId: { _id: creatorId, name: user.name } }, best.campaignId.milestones, {
          campaign: { id: String(best.campaignId._id), name: best.campaignId.name, status: best.campaignId.status },
        })
      : null,
    recentActivity: recent,
  };
}

async function recentActivity(creatorId: Types.ObjectId, limit: number) {
  const rows = await PayoutLedger.find({ creatorId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .populate<{ campaignId: { _id: Types.ObjectId; name: string } }>("campaignId", "name")
    .lean();
  return rows.map((l) => ({
    id: String(l._id),
    type: l.type,
    amountPaise: l.amountPaise,
    partial: l.partial,
    campaignId: String(l.campaignId._id),
    campaignName: l.campaignId.name,
    submissionId: String(l.submissionId),
    viewsAtAllocation: l.viewsAtAllocation,
    createdAt: l.createdAt,
  }));
}

export async function getEarningsHistory(user: AuthUser, q: Pagination & { days?: number }) {
  const creatorId = new Types.ObjectId(user.id);
  const days = q.days ?? 30;
  const since = new Date(Date.now() - days * 86_400_000);
  const [rows, total, daily] = await Promise.all([
    PayoutLedger.find({ creatorId })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skipFor(q))
      .limit(q.pageSize)
      .populate<{ campaignId: { _id: Types.ObjectId; name: string } }>("campaignId", "name")
      .lean(),
    PayoutLedger.countDocuments({ creatorId }),
    PayoutLedger.aggregate<{ _id: string; amountPaise: number }>([
      { $match: { creatorId, createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, amountPaise: { $sum: "$amountPaise" } } },
      { $sort: { _id: 1 } },
    ]),
  ]);
  return {
    items: rows.map((l) => ({
      id: String(l._id),
      type: l.type,
      amountPaise: l.amountPaise,
      partial: l.partial,
      campaignId: String(l.campaignId._id),
      campaignName: l.campaignId.name,
      submissionId: String(l.submissionId),
      viewsAtAllocation: l.viewsAtAllocation,
      createdAt: l.createdAt,
    })),
    daily: daily.map((d) => ({ date: d._id, amountPaise: d.amountPaise })),
    meta: pageMeta(q.page, q.pageSize, total),
  };
}
