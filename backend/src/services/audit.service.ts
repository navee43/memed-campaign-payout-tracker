import type { ClientSession } from "mongoose";
import { Types } from "mongoose";
import { logger } from "../config/logger";
import { AuditEvent, type AuditActor } from "../models/audit-event.model";
import type { RequestContext } from "../types/context";

export interface AuditInput {
  action: string;
  actorType: AuditActor;
  actorId?: string | null;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persists an audit event and mirrors it to the structured log. When a session
 * is given the event commits (or rolls back) with the business change it describes.
 */
export async function recordAudit(input: AuditInput, ctx?: RequestContext | null, session?: ClientSession): Promise<void> {
  const doc = {
    action: input.action,
    actorType: input.actorType,
    actorId: input.actorId ? new Types.ObjectId(input.actorId) : null,
    targetType: input.targetType,
    targetId: input.targetId,
    requestId: ctx?.requestId ?? null,
    ip: ctx?.ip ?? null,
    metadata: input.metadata ?? {},
  };
  await AuditEvent.create([doc], session ? { session } : {});
  logger.info({ audit: { ...doc, actorId: input.actorId ?? null } }, `audit:${input.action}`);
}
