import type { FundingStatus, Milestone } from "../../types/domain";
import { isValidPaise } from "../../utils/money";

/**
 * Pure payout rules. Nothing in this file touches the database, the clock or
 * the network, so every rule is unit-testable in isolation.
 */

export const MAX_MILESTONES = 20;

export class InvalidViewsError extends RangeError {
  constructor(views: unknown) {
    super(`View count must be a non-negative safe integer (received ${String(views)})`);
    this.name = "InvalidViewsError";
  }
}

export class InvalidMilestoneLadderError extends RangeError {
  constructor(public readonly issues: string[]) {
    super(`Invalid milestone ladder: ${issues.join("; ")}`);
    this.name = "InvalidMilestoneLadderError";
  }
}

export function isValidViewCount(views: unknown): views is number {
  return typeof views === "number" && Number.isSafeInteger(views) && views >= 0;
}

/**
 * Returns a list of human-readable problems with a milestone ladder; an empty
 * list means the ladder is valid. Rules:
 *  - 1..MAX_MILESTONES milestones
 *  - view thresholds are positive safe integers, unique and strictly increasing
 *  - payouts are positive integer paise and non-decreasing
 */
export function getMilestoneLadderIssues(milestones: readonly Milestone[]): string[] {
  const issues: string[] = [];
  const input: unknown = milestones; // runtime guard for untyped callers
  if (!Array.isArray(input) || milestones.length === 0) {
    return ["at least one milestone is required"];
  }
  if (milestones.length > MAX_MILESTONES) {
    issues.push(`no more than ${MAX_MILESTONES} milestones are allowed`);
  }
  milestones.forEach((m, i) => {
    const n = i + 1;
    if (!Number.isSafeInteger(m.views) || m.views <= 0) {
      issues.push(`milestone ${n}: view threshold must be a positive whole number`);
    }
    if (!isValidPaise(m.payoutPaise) || m.payoutPaise <= 0) {
      issues.push(`milestone ${n}: payout must be a positive amount in paise`);
    }
    const prev = milestones[i - 1];
    if (prev) {
      if (m.views <= prev.views) {
        issues.push(`milestone ${n}: view threshold must be greater than milestone ${n - 1} (${prev.views})`);
      }
      if (m.payoutPaise < prev.payoutPaise) {
        issues.push(`milestone ${n}: payout cannot be lower than milestone ${n - 1}`);
      }
    }
  });
  return issues;
}

export function assertValidMilestoneLadder(milestones: readonly Milestone[]): void {
  const issues = getMilestoneLadderIssues(milestones);
  if (issues.length > 0) throw new InvalidMilestoneLadderError(issues);
}

/** The largest payout any single submission could ever earn on this ladder. */
export function maxPayoutPaise(milestones: readonly Milestone[]): number {
  return milestones.reduce((max, m) => Math.max(max, m.payoutPaise), 0);
}

export interface MilestoneResolution {
  /** Payout for the highest milestone reached (0 if none). */
  payoutPaise: number;
  /** Zero-based index of the highest milestone reached, or -1. */
  reachedIndex: number;
  reached: Milestone | null;
  next: Milestone | null;
  /** 0..1 progress from the reached milestone (or zero) towards the next one; 1 when the ladder is complete. */
  progressToNext: number;
}

/**
 * Finds the highest milestone whose threshold is <= views. Milestones are not
 * cumulative: 65,000 views on a 10k/50k/100k ladder earns only the 50k payout.
 */
export function resolveMilestone(views: number, milestones: readonly Milestone[]): MilestoneResolution {
  if (!isValidViewCount(views)) throw new InvalidViewsError(views);
  assertValidMilestoneLadder(milestones);

  let reachedIndex = -1;
  for (let i = 0; i < milestones.length; i += 1) {
    const m = milestones[i];
    if (m && views >= m.views) reachedIndex = i;
    else break; // ladder is strictly increasing, nothing further can match
  }

  const reached = reachedIndex >= 0 ? (milestones[reachedIndex] ?? null) : null;
  const next = milestones[reachedIndex + 1] ?? null;
  const floor = reached?.views ?? 0;
  const progressToNext = next ? Math.min(1, Math.max(0, (views - floor) / (next.views - floor))) : 1;

  return { payoutPaise: reached?.payoutPaise ?? 0, reachedIndex, reached, next, progressToNext };
}

/** Required API: payout (in paise) for the highest milestone reached. */
export function calculatePayout(views: number, milestones: readonly Milestone[]): number {
  return resolveMilestone(views, milestones).payoutPaise;
}

export interface AllocationInput {
  /** Payout the submission is entitled to by the ladder. */
  eligiblePaise: number;
  /** Amount already allocated to this submission. */
  allocatedPaise: number;
  campaignBudgetPaise: number;
  campaignAllocatedPaise: number;
}

export interface AllocationPlan {
  /** Additional amount the submission is entitled to beyond what it already holds. */
  requiredPaise: number;
  /** Amount that will actually be reserved now (capped by the remaining budget). */
  grantPaise: number;
  newAllocatedPaise: number;
  remainingBeforePaise: number;
  remainingAfterPaise: number;
  fundingStatus: FundingStatus;
}

/**
 * Applies the partial-budget policy: a submission receives the delta between
 * its eligible payout and what it already holds, capped by the campaign's
 * remaining budget. Never negative, never more than the budget, never pays the
 * same amount twice (only the delta is ever granted).
 */
export function planAllocation(input: AllocationInput): AllocationPlan {
  for (const [k, v] of Object.entries(input)) {
    if (!isValidPaise(v)) throw new RangeError(`${k} must be a non-negative integer number of paise`);
  }
  const { eligiblePaise, allocatedPaise, campaignBudgetPaise, campaignAllocatedPaise } = input;
  const remainingBeforePaise = Math.max(0, campaignBudgetPaise - campaignAllocatedPaise);
  const requiredPaise = Math.max(0, eligiblePaise - allocatedPaise);
  const grantPaise = Math.min(requiredPaise, remainingBeforePaise);
  const newAllocatedPaise = allocatedPaise + grantPaise;
  return {
    requiredPaise,
    grantPaise,
    newAllocatedPaise,
    remainingBeforePaise,
    remainingAfterPaise: remainingBeforePaise - grantPaise,
    fundingStatus: fundingStatusFor(eligiblePaise, newAllocatedPaise),
  };
}

export function fundingStatusFor(eligiblePaise: number, allocatedPaise: number): FundingStatus {
  if (eligiblePaise <= 0) return "NOT_ELIGIBLE";
  if (allocatedPaise >= eligiblePaise) return "FULLY_FUNDED";
  if (allocatedPaise > 0) return "PARTIALLY_FUNDED";
  return "UNFUNDED";
}
