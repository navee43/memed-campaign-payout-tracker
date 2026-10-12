import { z } from "zod";
import { CAMPAIGN_STATUSES, PLATFORMS } from "../types/domain";
import { getMilestoneLadderIssues, maxPayoutPaise, MAX_MILESTONES } from "../services/payout/payout-calculator";
import { paginationSchema } from "../utils/pagination";
import { isoDate, positivePaise } from "./common";

export const milestoneSchema = z
  .object({
    views: z.number().int("View thresholds must be whole numbers").min(1).max(Number.MAX_SAFE_INTEGER),
    payoutPaise: positivePaise,
  })
  .strict();

const milestones = z.array(milestoneSchema).min(1, "Add at least one milestone").max(MAX_MILESTONES);

const coverImageUrl = z
  .string()
  .trim()
  .max(2048)
  .pipe(z.url({ protocol: /^https$/, error: "Cover image must be an https:// URL" }))
  .nullable();

const campaignFields = {
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(100),
  description: z.string().trim().max(2000).default(""),
  platform: z.enum(PLATFORMS),
  budgetPaise: positivePaise,
  milestones,
  startsAt: isoDate.nullable().optional(),
  endsAt: isoDate.nullable().optional(),
  coverImageUrl: coverImageUrl.optional(),
  coverTheme: z.number().int().min(0).max(5).optional(),
};

function checkDates(v: { startsAt?: Date | null; endsAt?: Date | null }, ctx: z.RefinementCtx): void {
  if (v.startsAt && v.endsAt && v.endsAt.getTime() <= v.startsAt.getTime()) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End date must be after the start date" });
  }
}

function checkLadderAndBudget(v: { milestones?: { views: number; payoutPaise: number }[]; budgetPaise?: number }, ctx: z.RefinementCtx): void {
  if (v.milestones) {
    for (const issue of getMilestoneLadderIssues(v.milestones)) {
      ctx.addIssue({ code: "custom", path: ["milestones"], message: issue });
    }
    if (v.budgetPaise !== undefined && maxPayoutPaise(v.milestones) > v.budgetPaise) {
      ctx.addIssue({
        code: "custom",
        path: ["budgetPaise"],
        message: "Budget must be at least the highest milestone payout, otherwise no creator could ever be paid in full",
      });
    }
  }
}

export const createCampaignSchema = z
  .object({ ...campaignFields, status: z.enum(["DRAFT", "LIVE"]).default("DRAFT") })
  .strict()
  .superRefine((v, ctx) => {
    checkDates(v, ctx);
    checkLadderAndBudget(v, ctx);
  });

/**
 * PATCH body. Which fields may change depends on the campaign's status; the
 * service enforces that (e.g. milestones and budget are frozen once live).
 */
export const updateCampaignSchema = z
  .object({
    name: campaignFields.name.optional(),
    description: z.string().trim().max(2000).optional(),
    platform: campaignFields.platform.optional(),
    budgetPaise: positivePaise.optional(),
    milestones: milestones.optional(),
    startsAt: campaignFields.startsAt,
    endsAt: campaignFields.endsAt,
    coverImageUrl: campaignFields.coverImageUrl,
    coverTheme: campaignFields.coverTheme,
    status: z.enum(CAMPAIGN_STATUSES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update")
  .superRefine((v, ctx) => {
    checkDates(v, ctx);
    checkLadderAndBudget(v, ctx);
  });

export const topUpSchema = z.object({ amountPaise: positivePaise }).strict();

export const listCampaignsQuery = paginationSchema
  .extend({
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    platform: z.enum(PLATFORMS).optional(),
    search: z.string().trim().max(64).optional(),
    /** Discovery filter: only campaigns whose best milestone pays at least this much. */
    minPayoutPaise: z.coerce.number().int().min(0).optional(),
    /** Discovery filter: only campaigns with at least this much budget left. */
    minRemainingPaise: z.coerce.number().int().min(0).optional(),
    sort: z.enum(["newest", "budget", "payout"]).default("newest"),
  })
  .strict();

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuery>;
