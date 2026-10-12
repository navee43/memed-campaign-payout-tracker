import mongoose, { type ClientSession } from "mongoose";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { AppError, ConcurrencyConflictError } from "../../utils/errors";

/**
 * Bounded-retry transaction runner.
 *
 * MongoDB aborts the loser of two transactions that write the same document
 * with a WriteConflict (labelled TransientTransactionError). Our own optimistic
 * precondition failures raise ConcurrencyConflictError. Both mean "someone else
 * changed the data I read" — the safe response is to discard everything and
 * re-run the whole unit of work against fresh data, which is what this does.
 *
 * The callback must be side-effect free outside the session (no HTTP calls,
 * no Redis writes) because it may run several times.
 */

interface LabelledError {
  hasErrorLabel?: (label: string) => boolean;
  code?: number;
  codeName?: string;
}

const WRITE_CONFLICT = 112;

export function isTransientError(err: unknown): boolean {
  if (err instanceof ConcurrencyConflictError) return true;
  const e = err as LabelledError;
  if (typeof e?.hasErrorLabel === "function" && e.hasErrorLabel("TransientTransactionError")) return true;
  return e?.code === WRITE_CONFLICT || e?.codeName === "WriteConflict";
}

function isUnknownCommitResult(err: unknown): boolean {
  const e = err as LabelledError;
  return typeof e?.hasErrorLabel === "function" && e.hasErrorLabel("UnknownTransactionCommitResult");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Full-jitter exponential backoff: spreads competing retries apart. */
export function backoffMs(attempt: number): number {
  const cap = Math.min(1_000, 25 * 2 ** attempt);
  return Math.floor(Math.random() * cap);
}

async function commitWithRetry(session: ClientSession): Promise<void> {
  for (let i = 0; ; i += 1) {
    try {
      await session.commitTransaction();
      return;
    } catch (err) {
      // Commit outcome unknown (e.g. network blip): committing again is safe and idempotent.
      if (isUnknownCommitResult(err) && i < 3) continue;
      throw err;
    }
  }
}

export interface TransactionOptions {
  label: string;
  maxAttempts?: number;
}

export async function runInTransaction<T>(fn: (session: ClientSession) => Promise<T>, opts: TransactionOptions): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? env().TRANSACTION_MAX_ATTEMPTS;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction({
        readConcern: { level: "snapshot" },
        writeConcern: { w: "majority" },
        readPreference: "primary",
      });
      const result = await fn(session);
      await commitWithRetry(session);
      return result;
    } catch (err) {
      lastError = err;
      if (session.inTransaction()) await session.abortTransaction().catch(() => undefined);
      if (!isTransientError(err)) throw err;
      logger.debug({ label: opts.label, attempt }, "transaction conflict; retrying");
      if (attempt < maxAttempts) await sleep(backoffMs(attempt));
    } finally {
      await session.endSession();
    }
  }
  logger.warn({ label: opts.label, err: lastError }, "transaction retries exhausted");
  throw new AppError(
    503,
    "CONTENDED",
    "This campaign is receiving many simultaneous updates. Nothing was changed — please retry.",
  );
}
