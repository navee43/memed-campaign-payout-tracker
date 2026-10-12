import { Schema, model, type InferSchemaType } from "mongoose";

export const AUDIT_ACTORS = ["USER", "SERVICE", "SIMULATION", "SYSTEM"] as const;
export type AuditActor = (typeof AUDIT_ACTORS)[number];

const auditEventSchema = new Schema(
  {
    action: { type: String, required: true },
    actorType: { type: String, enum: AUDIT_ACTORS, required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    requestId: { type: String, default: null },
    ip: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditEventSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditEventSchema.index({ action: 1, createdAt: -1 });

export type AuditEventAttrs = InferSchemaType<typeof auditEventSchema>;
export const AuditEvent = model("AuditEvent", auditEventSchema);
