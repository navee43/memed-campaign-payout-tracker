import { Schema, model, type InferSchemaType } from "mongoose";
import { LEDGER_TYPES } from "../types/domain";

/**
 * Append-only record of every change to a submission's allocation.
 *
 * Invariants (verified by the integrity check and the concurrency tests):
 *   sum(amountPaise) for a submission == submission.allocatedPaise
 *   sum(amountPaise) for a campaign   == campaign.allocatedPaise
 *
 * `allocationKey` = "<submissionId>:<sequence>" is unique, so the same
 * allocation step can never be recorded twice, however a request is retried.
 */
const payoutLedgerSchema = new Schema(
  {
    allocationKey: { type: String, required: true, immutable: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true, immutable: true },
    submissionId: { type: Schema.Types.ObjectId, ref: "Submission", required: true, immutable: true },
    creatorId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    brandId: { type: Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
    type: { type: String, enum: LEDGER_TYPES, required: true, immutable: true },
    sequence: { type: Number, required: true, min: 1, immutable: true },
    amountPaise: { type: Number, required: true, min: 1, immutable: true },

    /** Client-supplied Idempotency-Key, if any. */
    idempotencyKey: { type: String, default: null, immutable: true },
    /** Request id or reconciliation run id that produced this entry. */
    sourceEventId: { type: String, required: true, immutable: true },

    // Snapshot of the state right after this entry, for auditors.
    viewsAtAllocation: { type: Number, required: true, immutable: true },
    milestoneIndex: { type: Number, required: true, immutable: true },
    eligiblePaiseAfter: { type: Number, required: true, immutable: true },
    allocatedPaiseAfter: { type: Number, required: true, immutable: true },
    campaignAllocatedPaiseAfter: { type: Number, required: true, immutable: true },
    campaignBudgetPaise: { type: Number, required: true, immutable: true },
    partial: { type: Boolean, required: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, strict: "throw" },
);

payoutLedgerSchema.index({ allocationKey: 1 }, { unique: true, name: "uniq_allocation_key" });
payoutLedgerSchema.index({ submissionId: 1, sequence: 1 }, { unique: true, name: "uniq_submission_sequence" });
payoutLedgerSchema.index({ campaignId: 1, createdAt: -1 }, { name: "campaign_history" });
payoutLedgerSchema.index({ creatorId: 1, createdAt: -1 }, { name: "creator_history" });

const APPEND_ONLY = "PayoutLedger is append-only; corrections must be new entries";
const blocked = [
  "updateOne",
  "updateMany",
  "findOneAndUpdate",
  "replaceOne",
  "findOneAndReplace",
  "deleteOne",
  "deleteMany",
  "findOneAndDelete",
] as const;
for (const op of blocked) {
  payoutLedgerSchema.pre(op, function () {
    throw new Error(APPEND_ONLY);
  });
}
payoutLedgerSchema.pre("save", function () {
  if (!this.isNew) throw new Error(APPEND_ONLY);
});

export type PayoutLedgerAttrs = InferSchemaType<typeof payoutLedgerSchema>;
export const PayoutLedger = model("PayoutLedger", payoutLedgerSchema);
