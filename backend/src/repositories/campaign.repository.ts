import { Types, type PipelineStage } from "mongoose";
import { Campaign } from "../models/campaign.model";
import type { CampaignStatus, Platform } from "../types/domain";
import { skipFor } from "../utils/pagination";
import type { ListCampaignsQuery } from "../validators/campaign.validators";

/** Escapes user search text so it is matched literally (no regex injection / ReDoS). */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CampaignListRow {
  _id: Types.ObjectId;
  ownerId: { _id: Types.ObjectId; name?: string };
  name: string;
  description: string;
  platform: Platform;
  status: CampaignStatus;
  budgetPaise: number;
  allocatedPaise: number;
  paidPaise: number;
  milestones: { views: number; payoutPaise: number }[];
  startsAt: Date | null;
  endsAt: Date | null;
  coverImageUrl: string | null;
  coverTheme: number;
  submissionCount: number;
  publishedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Lists campaigns with filtering, sorting and pagination in one round trip
 * ($facet), joining only the owner's display name.
 */
export async function findCampaigns(
  scope: { ownerId?: string; statuses?: CampaignStatus[] },
  q: ListCampaignsQuery,
): Promise<{ rows: CampaignListRow[]; total: number }> {
  const match: Record<string, unknown> = {};
  if (scope.ownerId) match.ownerId = new Types.ObjectId(scope.ownerId);
  if (q.status) match.status = q.status;
  else if (scope.statuses) match.status = { $in: scope.statuses };
  if (q.platform) match.platform = q.platform;
  if (q.search) match.name = { $regex: escapeRegex(q.search), $options: "i" };
  if (q.minPayoutPaise !== undefined) match["milestones.payoutPaise"] = { $gte: q.minPayoutPaise };
  if (q.minRemainingPaise !== undefined) {
    match.$expr = { $gte: [{ $subtract: ["$budgetPaise", "$allocatedPaise"] }, q.minRemainingPaise] };
  }

  const sort: Record<string, 1 | -1> =
    q.sort === "budget"
      ? { remainingPaise: -1, _id: -1 }
      : q.sort === "payout"
        ? { maxPayoutPaise: -1, _id: -1 }
        : { createdAt: -1, _id: -1 };

  const pipeline: PipelineStage[] = [
    { $match: match },
    {
      $addFields: {
        remainingPaise: { $subtract: ["$budgetPaise", "$allocatedPaise"] },
        maxPayoutPaise: { $max: "$milestones.payoutPaise" },
      },
    },
    { $sort: sort },
    {
      $facet: {
        rows: [
          { $skip: skipFor(q) },
          { $limit: q.pageSize },
          { $lookup: { from: "users", localField: "ownerId", foreignField: "_id", as: "owner" } },
          {
            $addFields: {
              ownerId: { _id: "$ownerId", name: { $arrayElemAt: ["$owner.name", 0] } },
            },
          },
          { $project: { owner: 0, remainingPaise: 0, maxPayoutPaise: 0, __v: 0 } },
        ],
        total: [{ $count: "n" }],
      },
    },
  ];
  const [res] = await Campaign.aggregate<{ rows: CampaignListRow[]; total: { n: number }[] }>(pipeline);
  return { rows: res?.rows ?? [], total: res?.total[0]?.n ?? 0 };
}

export async function findOwnedCampaign(id: string, ownerId: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return Campaign.findOne({ _id: id, ownerId: new Types.ObjectId(ownerId) });
}

/** Campaigns visible to creators: anything that has been published. */
export async function findVisibleCampaign(id: string) {
  if (!Types.ObjectId.isValid(id)) return null;
  return Campaign.findOne({ _id: id, status: { $ne: "DRAFT" } }).populate<{ ownerId: { _id: Types.ObjectId; name: string } }>("ownerId", "name");
}
