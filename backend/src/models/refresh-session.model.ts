import { Schema, model, type InferSchemaType } from "mongoose";

/**
 * One row per issued refresh token. Only a SHA-256 hash of the token is stored.
 * Rotation marks the old row as rotated and inserts a new row in the same
 * family; presenting an already-rotated token (outside a short grace window)
 * is treated as theft and revokes the whole family.
 */
const refreshSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    rotatedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
    userAgent: { type: String, maxlength: 256, default: null },
    ip: { type: String, maxlength: 64, default: null },
  },
  { timestamps: true },
);

refreshSessionSchema.index({ tokenHash: 1 }, { unique: true, name: "uniq_token_hash" });
refreshSessionSchema.index({ userId: 1, revokedAt: 1 });
refreshSessionSchema.index({ familyId: 1 });
// Expired sessions are removed automatically by MongoDB's TTL monitor.
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "ttl_expires" });

export type RefreshSessionAttrs = InferSchemaType<typeof refreshSessionSchema>;
export const RefreshSession = model("RefreshSession", refreshSessionSchema);
