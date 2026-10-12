import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * Stores the outcome of a request made with an Idempotency-Key so a retry
 * returns the original result instead of re-running the operation. Written in
 * the same transaction as the effect it describes.
 */
const idempotencyRecordSchema = new Schema(
  {
    scope: { type: String, required: true },
    key: { type: String, required: true, maxlength: 128 },
    requestHash: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

idempotencyRecordSchema.index({ scope: 1, key: 1 }, { unique: true, name: "uniq_scope_key" });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expires" });

export type IdempotencyRecordAttrs = InferSchemaType<typeof idempotencyRecordSchema>;
export const IdempotencyRecord = model("IdempotencyRecord", idempotencyRecordSchema);
