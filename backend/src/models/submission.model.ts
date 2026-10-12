import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { FUNDING_STATUSES, PLATFORMS, SUBMISSION_STATUSES } from "../types/domain";

export const VIEW_HISTORY_LIMIT = 50;

const viewSnapshotSchema = new Schema(
  {
    views: { type: Number, required: true, min: 0 },
    observedAt: { type: Date, required: true },
    recordedAt: { type: Date, required: true },
  },
  { _id: false },
);

const anomalySchema = new Schema(
  {
    flagged: { type: Boolean, default: false },
    reason: { type: String, default: null },
    detectedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    flagCount: { type: Number, default: 0 },
  },
  { _id: false },
);

const submissionSchema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true, immutable: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    platform: { type: String, enum: PLATFORMS, required: true, immutable: true },
    postId: { type: String, required: true, immutable: true },
    canonicalUrl: { type: String, required: true, immutable: true },
    originalUrl: { type: String, required: true, maxlength: 2048 },

    status: { type: String, enum: SUBMISSION_STATUSES, default: "ACTIVE" },
    rejectedReason: { type: String, default: null, maxlength: 500 },
    rejectedAt: { type: Date, default: null },

    currentViews: { type: Number, default: 0, min: 0 },
    /** Platform-side timestamp of the latest accepted snapshot (stale-update guard). */
    lastObservedAt: { type: Date, default: null },
    lastViewUpdateAt: { type: Date, default: null },
    viewHistory: { type: [viewSnapshotSchema], default: [] },

    /** Integer paise. eligible = ladder entitlement; allocated = actually reserved from budget. */
    eligiblePaise: { type: Number, default: 0, min: 0 },
    allocatedPaise: { type: Number, default: 0, min: 0 },
    highestMilestoneIndex: { type: Number, default: -1 },
    fundingStatus: { type: String, enum: FUNDING_STATUSES, default: "NOT_ELIGIBLE" },
    /** Set while eligible > allocated; drives deterministic reconciliation order. */
    underfundedSince: { type: Date, default: null },
    /** Number of ledger entries written for this submission (ledger sequence). */
    allocationVersion: { type: Number, default: 0, min: 0 },

    anomaly: { type: anomalySchema, default: () => ({}) },
  },
  { timestamps: true, strict: "throw" },
);

// One post can be submitted to a campaign once, by anyone. This is stricter
// than (creator, campaign, url) and also stops creators claiming each other's posts.
submissionSchema.index({ campaignId: 1, canonicalUrl: 1 }, { unique: true, name: "uniq_campaign_post" });
submissionSchema.index({ creatorId: 1, createdAt: -1 }, { name: "creator_recent" });
submissionSchema.index({ campaignId: 1, createdAt: -1 }, { name: "campaign_recent" });
submissionSchema.index({ campaignId: 1, currentViews: -1 }, { name: "campaign_views" });
submissionSchema.index(
  { campaignId: 1, underfundedSince: 1, _id: 1 },
  { name: "reconciliation_queue", partialFilterExpression: { underfundedSince: { $type: "date" } } },
);
submissionSchema.index({ campaignId: 1, "anomaly.flagged": 1 }, { name: "campaign_anomalies" });

export type SubmissionAttrs = InferSchemaType<typeof submissionSchema>;
export type SubmissionDoc = HydratedDocument<SubmissionAttrs>;
export const Submission = model("Submission", submissionSchema);
