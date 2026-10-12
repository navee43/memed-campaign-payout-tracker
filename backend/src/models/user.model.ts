import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { ACCOUNT_STATUSES, ROLES } from "../types/domain";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    /** Lower-cased, trimmed. Uniqueness is enforced by the unique index below. */
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, immutable: true },
    status: { type: String, enum: ACCOUNT_STATUSES, default: "ACTIVE" },
    /** Incremented on "log out everywhere"; embedded in access tokens. */
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true, strict: "throw" },
);

userSchema.index({ email: 1 }, { unique: true, name: "uniq_email" });

export type UserAttrs = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserAttrs>;
export const User = model("User", userSchema);
