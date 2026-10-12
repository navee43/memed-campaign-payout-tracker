import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { CAMPAIGN_STATUSES, PLATFORMS } from "../types/domain";

const milestoneSchema = new Schema(
  {
    views: { type: Number, required: true, min: 1 },
    payoutPaise: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const campaignSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000, default: "" },
    platform: { type: String, enum: PLATFORMS, required: true },

    /**
     * Money (integer paise).
     *  budgetPaise     – total committed by the brand
     *  allocatedPaise  – running total reserved for creators. Updated ONLY inside
     *                    payout transactions, together with the ledger entry that
     *                    explains it. The ledger is the audit source of truth;
     *                    this field is the transactional projection used to
     *                    enforce the cap (verified by the integrity check).
     *  paidPaise       – actually disbursed. Bank disbursement is not part of this
     *                    release, so it stays 0 and the UI says so.
     */
    budgetPaise: { type: Number, required: true, min: 1 },
    allocatedPaise: { type: Number, default: 0, min: 0 },
    paidPaise: { type: Number, default: 0, min: 0 },

    milestones: { type: [milestoneSchema], required: true },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "DRAFT" },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    coverImageUrl: { type: String, default: null, maxlength: 2048 },
    coverTheme: { type: Number, default: 0, min: 0, max: 5 },

    submissionCount: { type: Number, default: 0, min: 0 },
    publishedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    budgetExhaustedAt: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw" },
);

campaignSchema.index({ ownerId: 1, status: 1, createdAt: -1 }, { name: "owner_status_created" });
campaignSchema.index({ status: 1, platform: 1, createdAt: -1 }, { name: "discovery" });

export type CampaignAttrs = InferSchemaType<typeof campaignSchema>;
export type CampaignDoc = HydratedDocument<CampaignAttrs>;
export const Campaign = model("Campaign", campaignSchema);
