import { AuditEvent } from "./audit-event.model";
import { Campaign } from "./campaign.model";
import { IdempotencyRecord } from "./idempotency-record.model";
import { PayoutLedger } from "./payout-ledger.model";
import { RefreshSession } from "./refresh-session.model";
import { Submission } from "./submission.model";
import { User } from "./user.model";

export { AuditEvent, Campaign, IdempotencyRecord, PayoutLedger, RefreshSession, Submission, User };

export const allModels = [User, RefreshSession, Campaign, Submission, PayoutLedger, IdempotencyRecord, AuditEvent];

/**
 * Creates collections (and, when autoIndex is on, indexes) up front. Some
 * MongoDB versions cannot create a collection inside a transaction, so the
 * payout engine must never be the first writer to a collection.
 */
export async function initModels(): Promise<void> {
  await Promise.all(allModels.map((m) => m.init()));
  await Promise.all(allModels.map((m) => m.createCollection().catch(() => undefined)));
}

/** Non-destructive index build (never drops indexes), used by `npm run db:init`. */
export async function createAllIndexes(): Promise<void> {
  for (const m of allModels) {
    await m.createCollection().catch(() => undefined);
    await m.createIndexes();
  }
}
