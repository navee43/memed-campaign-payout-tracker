import { Types, type ClientSession } from "mongoose";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { Campaign, type CampaignDoc } from "../../models/campaign.model";
import { IdempotencyRecord } from "../../models/idempotency-record.model";
import { PayoutLedger } from "../../models/payout-ledger.model";
import { Submission, VIEW_HISTORY_LIMIT, type SubmissionDoc } from "../../models/submission.model";
import type { RequestContext } from "../../types/context";
import type { LedgerType, Milestone } from "../../types/domain";
import { AppError, ConcurrencyConflictError, conflict, notFound } from "../../utils/errors";
import { sha256, stableStringify } from "../../utils/crypto";
import { recordAudit } from "../audit.service";
import { invalidateCampaignLists } from "../cache/campaign-cache";
import { detectViewSpike, spikeConfigFromEnv } from "../anomaly/view-spike-detector";
import { budgetSummary, presentSubmission, type BudgetSummary, type SubmissionView } from "../presenters";
import { fundingStatusFor, planAllocation, resolveMilestone } from "./payout-calculator";
import { runInTransaction } from "./transaction";

/**
 * The payout engine: the only code allowed to change money fields.
 *
 * Every allocation happens inside a MongoDB transaction that, atomically:
 *   1. reserves the amount on the campaign with a conditional update that can
 *      only match if `allocatedPaise + amount <= budgetPaise` AND the campaign
 *      is unchanged since we read it (optimistic lock);
 *   2. updates the submission, guarded by its allocationVersion (optimistic lock);
 *   3. appends a ledger entry whose unique allocationKey makes double-recording
 *      impossible.
 * If anything conflicts, the transaction aborts and is retried from fresh data,
 * so concurrent updates can never overspend, double-allocate or lose updates.
 * Redis plays no part here.
 */

const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const IDEMPOTENCY_TTL_MS = 24 * 3_600_000;
/** Max queued submissions back-filled in one transaction. */
const RECONCILE_BATCH = 500;

export interface ViewUpdateCommand {
  submissionId: string;
  views: number;
  observedAt?: Date;
  idempotencyKey?: string;
  actor: "SERVICE" | "SIMULATION";
  ctx: RequestContext;
}

export interface ViewUpdateResult {
  outcome: "UPDATED" | "UNCHANGED";
  submission: SubmissionView;
  allocation: {
    requiredPaise: number;
    grantedPaise: number;
    partial: boolean;
    ledgerEntryId: string | null;
  };
  campaign: { id: string; status: string } & BudgetSummary;
  anomaly: { flagged: boolean; newlyFlagged: boolean; reason: string | null };
  idempotentReplay: boolean;
}

interface ReserveArgs {
  campaign: Pick<CampaignDoc, "_id" | "allocatedPaise" | "budgetPaise">;
  amountPaise: number;
  session: ClientSession;
  now: Date;
}

/**
 * Atomically reserves `amountPaise` from the campaign. The filter both caps
 * the total at the budget and asserts the allocated total is exactly what we
 * computed from, so a concurrent writer forces a retry instead of a lost update.
 */
async function reserveBudget({ campaign, amountPaise, session, now }: ReserveArgs): Promise<{ allocatedPaise: number; budgetPaise: number }> {
  const exhausts = campaign.allocatedPaise + amountPaise >= campaign.budgetPaise;
  const reserved = await Campaign.findOneAndUpdate(
    {
      _id: campaign._id,
      allocatedPaise: campaign.allocatedPaise,
      $expr: { $lte: [{ $add: ["$allocatedPaise", amountPaise] }, "$budgetPaise"] },
    },
    { $inc: { allocatedPaise: amountPaise }, ...(exhausts ? { $set: { budgetExhaustedAt: now } } : {}) },
    { session, new: true, projection: { allocatedPaise: 1, budgetPaise: 1 } },
  ).lean();
  if (!reserved) throw new ConcurrencyConflictError("campaign allocation changed");
  return { allocatedPaise: reserved.allocatedPaise, budgetPaise: reserved.budgetPaise };
}

interface LedgerArgs {
  type: LedgerType;
  submission: Pick<SubmissionDoc, "_id" | "campaignId" | "creatorId" | "brandId" | "allocationVersion">;
  amountPaise: number;
  views: number;
  milestoneIndex: number;
  eligiblePaiseAfter: number;
  allocatedPaiseAfter: number;
  campaignAllocatedPaiseAfter: number;
  campaignBudgetPaise: number;
  idempotencyKey: string | null;
  sourceEventId: string;
  session: ClientSession;
}

async function appendLedger(a: LedgerArgs): Promise<string> {
  const sequence = a.submission.allocationVersion + 1;
  const [entry] = await PayoutLedger.create(
    [
      {
        allocationKey: `${String(a.submission._id)}:${sequence}`,
        campaignId: a.submission.campaignId,
        submissionId: a.submission._id,
        creatorId: a.submission.creatorId,
        brandId: a.submission.brandId,
        type: a.type,
        sequence,
        amountPaise: a.amountPaise,
        idempotencyKey: a.idempotencyKey,
        sourceEventId: a.sourceEventId,
        viewsAtAllocation: a.views,
        milestoneIndex: a.milestoneIndex,
        eligiblePaiseAfter: a.eligiblePaiseAfter,
        allocatedPaiseAfter: a.allocatedPaiseAfter,
        campaignAllocatedPaiseAfter: a.campaignAllocatedPaiseAfter,
        campaignBudgetPaise: a.campaignBudgetPaise,
        partial: a.allocatedPaiseAfter < a.eligiblePaiseAfter,
      },
    ],
    { session: a.session },
  );
  return String(entry!._id);
}

function campaignSummary(c: { _id: Types.ObjectId; status: string; budgetPaise: number; allocatedPaise: number; paidPaise?: number | null }) {
  return { id: String(c._id), status: c.status, ...budgetSummary(c) };
}

/**
 * PATCH /api/submissions/:id/views — record a new view snapshot and allocate
 * any payout it unlocks.
 */
export async function applyViewUpdate(cmd: ViewUpdateCommand): Promise<ViewUpdateResult> {
  if (!Types.ObjectId.isValid(cmd.submissionId)) throw notFound("Submission");
  const cfg = env();
  const spikeConfig = spikeConfigFromEnv(cfg);
  const scope = `views:${cmd.submissionId}`;
  const requestHash = sha256(
    stableStringify({ submissionId: cmd.submissionId, views: cmd.views, observedAt: cmd.observedAt?.toISOString() ?? null }),
  );

  let exhaustedNow = false;
  const result = await runInTransaction<ViewUpdateResult>(
    async (session) => {
      exhaustedNow = false;
      if (cmd.idempotencyKey) {
        const prior = await IdempotencyRecord.findOne({ scope, key: cmd.idempotencyKey }).session(session).lean();
        if (prior) {
          if (prior.requestHash !== requestHash) {
            throw new AppError(422, "IDEMPOTENCY_KEY_REUSED", "This Idempotency-Key was already used with a different request.");
          }
          return { ...(prior.responseBody as ViewUpdateResult), idempotentReplay: true };
        }
      }

      const sub = await Submission.findById(cmd.submissionId).session(session);
      if (!sub) throw notFound("Submission");
      const campaign = await Campaign.findById(sub.campaignId).session(session);
      if (!campaign) throw notFound("Campaign");

      if (campaign.status !== "LIVE" && campaign.status !== "PAUSED") {
        throw conflict("CAMPAIGN_NOT_TRACKING", `View updates are not accepted while the campaign is ${campaign.status.toLowerCase()}.`);
      }
      if (sub.status === "REJECTED") {
        throw conflict("SUBMISSION_REJECTED", "This submission was rejected by the brand and no longer earns payouts.");
      }

      const now = new Date();
      const observedAt = cmd.observedAt ?? now;
      if (observedAt.getTime() > now.getTime() + MAX_FUTURE_SKEW_MS) {
        throw new AppError(422, "INVALID_OBSERVED_AT", "observedAt cannot be in the future.");
      }
      if (sub.lastObservedAt && observedAt.getTime() < sub.lastObservedAt.getTime()) {
        throw conflict("STALE_SNAPSHOT", "This snapshot is older than the latest recorded one and was ignored.", {
          lastObservedAt: sub.lastObservedAt,
        });
      }
      if (cmd.views < sub.currentViews) {
        throw conflict(
          "VIEWS_CANNOT_DECREASE",
          `View counts only move forward. Current count is ${sub.currentViews}; received ${cmd.views}. Corrections need an authorised correction workflow.`,
          { currentViews: sub.currentViews },
        );
      }

      const milestones = campaign.milestones as Milestone[];
      const resolution = resolveMilestone(cmd.views, milestones);
      // Entitlement never shrinks: views never decrease and the ladder is frozen once live.
      const eligiblePaise = Math.max(resolution.payoutPaise, sub.eligiblePaise);
      const plan = planAllocation({
        eligiblePaise,
        allocatedPaise: sub.allocatedPaise,
        campaignBudgetPaise: campaign.budgetPaise,
        campaignAllocatedPaise: campaign.allocatedPaise,
      });

      const viewsChanged = cmd.views > sub.currentViews;
      if (!viewsChanged && plan.grantPaise === 0) {
        // Exact repeat of the current state: nothing to record, nothing to allocate.
        const unchanged: ViewUpdateResult = {
          outcome: "UNCHANGED",
          submission: presentSubmission(sub.toObject(), milestones),
          allocation: { requiredPaise: plan.requiredPaise, grantedPaise: 0, partial: false, ledgerEntryId: null },
          campaign: campaignSummary(campaign),
          anomaly: { flagged: Boolean(sub.anomaly?.flagged), newlyFlagged: false, reason: sub.anomaly?.reason ?? null },
          idempotentReplay: false,
        };
        if (cmd.idempotencyKey) await saveIdempotency(scope, cmd.idempotencyKey, requestHash, unchanged, session, now);
        return unchanged;
      }

      const spike = viewsChanged
        ? detectViewSpike(sub.viewHistory ?? [], { views: cmd.views, observedAt }, spikeConfig)
        : null;
      const newlyFlagged = Boolean(spike?.flagged);

      // 1. Reserve budget (never more than remains; see planAllocation).
      let campaignAfter = { allocatedPaise: campaign.allocatedPaise, budgetPaise: campaign.budgetPaise };
      if (plan.grantPaise > 0) {
        campaignAfter = await reserveBudget({ campaign, amountPaise: plan.grantPaise, session, now });
        exhaustedNow = campaignAfter.allocatedPaise >= campaignAfter.budgetPaise;
      }

      // 2. Update the submission (optimistic lock on version + current views).
      const set: Record<string, unknown> = {
        eligiblePaise,
        allocatedPaise: plan.newAllocatedPaise,
        highestMilestoneIndex: Math.max(resolution.reachedIndex, sub.highestMilestoneIndex),
        fundingStatus: plan.fundingStatus,
        underfundedSince: plan.newAllocatedPaise < eligiblePaise ? (sub.underfundedSince ?? now) : null,
        lastViewUpdateAt: now,
      };
      if (viewsChanged) {
        set.currentViews = cmd.views;
        set.lastObservedAt = observedAt;
      }
      if (newlyFlagged && spike) {
        set["anomaly.flagged"] = true;
        set["anomaly.reason"] = spike.reason;
        set["anomaly.detectedAt"] = now;
        set["anomaly.reviewedAt"] = null;
        set["anomaly.reviewedBy"] = null;
      }
      const update: Record<string, unknown> = { $set: set };
      const inc: Record<string, number> = {};
      if (plan.grantPaise > 0) inc.allocationVersion = 1;
      if (newlyFlagged) inc["anomaly.flagCount"] = 1;
      if (Object.keys(inc).length > 0) update.$inc = inc;
      if (viewsChanged) {
        update.$push = {
          viewHistory: { $each: [{ views: cmd.views, observedAt, recordedAt: now }], $slice: -VIEW_HISTORY_LIMIT },
        };
      }
      const updated = await Submission.findOneAndUpdate(
        { _id: sub._id, allocationVersion: sub.allocationVersion, currentViews: sub.currentViews },
        update,
        { session, new: true },
      );
      if (!updated) throw new ConcurrencyConflictError("submission changed");

      // 3. Ledger entry for the allocation change.
      let ledgerEntryId: string | null = null;
      if (plan.grantPaise > 0) {
        ledgerEntryId = await appendLedger({
          type: "VIEW_MILESTONE",
          submission: sub,
          amountPaise: plan.grantPaise,
          views: cmd.views,
          milestoneIndex: resolution.reachedIndex,
          eligiblePaiseAfter: eligiblePaise,
          allocatedPaiseAfter: plan.newAllocatedPaise,
          campaignAllocatedPaiseAfter: campaignAfter.allocatedPaise,
          campaignBudgetPaise: campaignAfter.budgetPaise,
          idempotencyKey: cmd.idempotencyKey ?? null,
          sourceEventId: cmd.ctx.requestId,
          session,
        });
      }

      await recordAudit(
        {
          action: "VIEWS_UPDATED",
          actorType: cmd.actor,
          targetType: "Submission",
          targetId: String(sub._id),
          metadata: {
            fromViews: sub.currentViews,
            toViews: cmd.views,
            observedAt,
            eligiblePaise,
            grantedPaise: plan.grantPaise,
            fundingStatus: plan.fundingStatus,
            anomaly: spike?.status ?? null,
          },
        },
        cmd.ctx,
        session,
      );
      if (newlyFlagged) {
        await recordAudit(
          {
            action: "VIEW_SPIKE_FLAGGED",
            actorType: "SYSTEM",
            targetType: "Submission",
            targetId: String(sub._id),
            metadata: { reason: spike?.reason, metrics: spike?.metrics },
          },
          cmd.ctx,
          session,
        );
      }

      const response: ViewUpdateResult = {
        outcome: "UPDATED",
        submission: presentSubmission(updated.toObject(), milestones),
        allocation: {
          requiredPaise: plan.requiredPaise,
          grantedPaise: plan.grantPaise,
          partial: plan.newAllocatedPaise < eligiblePaise,
          ledgerEntryId,
        },
        campaign: campaignSummary({ ...campaign.toObject(), ...campaignAfter }),
        anomaly: {
          flagged: Boolean(updated.anomaly?.flagged),
          newlyFlagged,
          reason: updated.anomaly?.reason ?? null,
        },
        idempotentReplay: false,
      };
      if (cmd.idempotencyKey) await saveIdempotency(scope, cmd.idempotencyKey, requestHash, response, session, now);
      return response;
    },
    { label: "view-update" },
  );

  // Side effects strictly after commit (never inside the transaction).
  if (exhaustedNow) await invalidateCampaignLists();
  return result;
}

async function saveIdempotency(
  scope: string,
  key: string,
  requestHash: string,
  body: ViewUpdateResult,
  session: ClientSession,
  now: Date,
): Promise<void> {
  // JSON round-trip stores plain data (Dates become ISO strings, like the HTTP response).
  const plain = JSON.parse(JSON.stringify(body)) as unknown;
  try {
    await IdempotencyRecord.create(
      [{ scope, key, requestHash, responseStatus: 200, responseBody: plain, expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS) }],
      { session },
    );
  } catch (err) {
    // A concurrent request with the same key committed first: retry, which will replay its result.
    if ((err as { code?: number }).code === 11000) throw new ConcurrencyConflictError("idempotency key race");
    throw err;
  }
}

/**
 * Back-fills under-funded submissions of one campaign, oldest shortfall first
 * (underfundedSince ASC, then _id ASC). Runs inside the caller's transaction so
 * it composes with budget top-ups: new money reaches the queue before any other
 * request can see it.
 */
export async function allocateFromQueue(
  campaignId: Types.ObjectId,
  session: ClientSession,
  sourceEventId: string,
): Promise<{ allocatedPaise: number; submissionsFunded: number; remainingPaise: number }> {
  const campaign = await Campaign.findById(campaignId).session(session);
  if (!campaign) throw notFound("Campaign");
  if (campaign.status !== "LIVE" && campaign.status !== "PAUSED") {
    return { allocatedPaise: 0, submissionsFunded: 0, remainingPaise: Math.max(0, campaign.budgetPaise - campaign.allocatedPaise) };
  }

  let remaining = Math.max(0, campaign.budgetPaise - campaign.allocatedPaise);
  if (remaining === 0) return { allocatedPaise: 0, submissionsFunded: 0, remainingPaise: 0 };

  const queue = await Submission.find({ campaignId, underfundedSince: { $type: "date" }, status: "ACTIVE" })
    .sort({ underfundedSince: 1, _id: 1 })
    .limit(RECONCILE_BATCH)
    .session(session);

  let total = 0;
  let funded = 0;
  let runningCampaignAllocated = campaign.allocatedPaise;
  for (const sub of queue) {
    if (remaining === 0) break;
    const shortfall = Math.max(0, sub.eligiblePaise - sub.allocatedPaise);
    const grant = Math.min(shortfall, remaining);
    if (grant === 0) {
      // Defensive: inconsistent queue marker. Clear it so it can't block the queue.
      await Submission.updateOne({ _id: sub._id }, { $set: { underfundedSince: null } }, { session });
      continue;
    }
    const newAllocated = sub.allocatedPaise + grant;
    const status = fundingStatusFor(sub.eligiblePaise, newAllocated);
    const updated = await Submission.findOneAndUpdate(
      { _id: sub._id, allocationVersion: sub.allocationVersion, allocatedPaise: sub.allocatedPaise },
      {
        $set: {
          allocatedPaise: newAllocated,
          fundingStatus: status,
          underfundedSince: newAllocated < sub.eligiblePaise ? sub.underfundedSince : null,
        },
        $inc: { allocationVersion: 1 },
      },
      { session, new: true },
    );
    if (!updated) throw new ConcurrencyConflictError("queued submission changed");
    runningCampaignAllocated += grant;
    await appendLedger({
      type: "RECONCILIATION",
      submission: sub,
      amountPaise: grant,
      views: sub.currentViews,
      milestoneIndex: sub.highestMilestoneIndex,
      eligiblePaiseAfter: sub.eligiblePaise,
      allocatedPaiseAfter: newAllocated,
      campaignAllocatedPaiseAfter: runningCampaignAllocated,
      campaignBudgetPaise: campaign.budgetPaise,
      idempotencyKey: null,
      sourceEventId,
      session,
    });
    remaining -= grant;
    total += grant;
    funded += 1;
  }

  if (total > 0) {
    await reserveBudget({ campaign, amountPaise: total, session, now: new Date() });
  }
  return { allocatedPaise: total, submissionsFunded: funded, remainingPaise: remaining };
}

/** Standalone reconciliation of one campaign (used by the job and the manual trigger). */
export async function reconcileCampaign(campaignId: string, runId: string) {
  const id = new Types.ObjectId(campaignId);
  const outcome = await runInTransaction((session) => allocateFromQueue(id, session, runId), { label: "reconcile" });
  if (outcome.allocatedPaise > 0) {
    logger.info({ campaignId, runId, ...outcome }, "reconciliation allocated funds");
    if (outcome.remainingPaise === 0) await invalidateCampaignLists();
  }
  return outcome;
}

/** Campaigns that have money left AND submissions waiting for it. */
export async function findCampaignsNeedingReconciliation(limit = 100): Promise<string[]> {
  const ids: Types.ObjectId[] = await Submission.distinct("campaignId", { underfundedSince: { $type: "date" }, status: "ACTIVE" });
  if (ids.length === 0) return [];
  const campaigns = await Campaign.find(
    { _id: { $in: ids }, status: { $in: ["LIVE", "PAUSED"] }, $expr: { $lt: ["$allocatedPaise", "$budgetPaise"] } },
    { _id: 1 },
  )
    .limit(limit)
    .lean();
  return campaigns.map((c) => String(c._id));
}

export interface IntegrityReport {
  campaignId: string;
  consistent: boolean;
  campaignAllocatedPaise: number;
  ledgerTotalPaise: number;
  submissionsAllocatedPaise: number;
  withinBudget: boolean;
  mismatchedSubmissions: number;
}

/**
 * Verifies the money invariants for a campaign. Read-only: it reports, it never
 * "fixes" — a mismatch is an incident for a human, not something to paper over.
 */
export async function checkCampaignIntegrity(campaignId: string): Promise<IntegrityReport> {
  const id = new Types.ObjectId(campaignId);
  const campaign = await Campaign.findById(id, { allocatedPaise: 1, budgetPaise: 1 }).lean();
  if (!campaign) throw notFound("Campaign");
  const [ledgerTotals, subTotals, perSubLedger] = await Promise.all([
    PayoutLedger.aggregate<{ total: number }>([{ $match: { campaignId: id } }, { $group: { _id: null, total: { $sum: "$amountPaise" } } }]),
    Submission.aggregate<{ total: number }>([{ $match: { campaignId: id } }, { $group: { _id: null, total: { $sum: "$allocatedPaise" } } }]),
    PayoutLedger.aggregate<{ _id: Types.ObjectId; total: number }>([
      { $match: { campaignId: id } },
      { $group: { _id: "$submissionId", total: { $sum: "$amountPaise" } } },
    ]),
  ]);
  const ledgerTotalPaise = ledgerTotals[0]?.total ?? 0;
  const submissionsAllocatedPaise = subTotals[0]?.total ?? 0;
  const subs = await Submission.find({ campaignId: id }, { allocatedPaise: 1 }).lean();
  const ledgerBySub = new Map(perSubLedger.map((r) => [String(r._id), r.total]));
  const mismatchedSubmissions = subs.filter((s) => (ledgerBySub.get(String(s._id)) ?? 0) !== s.allocatedPaise).length;
  const withinBudget = campaign.allocatedPaise <= campaign.budgetPaise;
  return {
    campaignId,
    consistent:
      withinBudget &&
      ledgerTotalPaise === campaign.allocatedPaise &&
      submissionsAllocatedPaise === campaign.allocatedPaise &&
      mismatchedSubmissions === 0,
    campaignAllocatedPaise: campaign.allocatedPaise,
    ledgerTotalPaise,
    submissionsAllocatedPaise,
    withinBudget,
    mismatchedSubmissions,
  };
}
