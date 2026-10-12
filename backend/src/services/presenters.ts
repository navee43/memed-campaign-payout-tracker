import { Types } from "mongoose";
import type { CampaignStatus, FundingStatus, Milestone, Platform, SubmissionStatus } from "../types/domain";
import { maxPayoutPaise, resolveMilestone } from "./payout/payout-calculator";

/**
 * Presenters turn database documents into the API's public shapes. They are
 * the only place response fields are chosen, which prevents accidental leaks
 * (password hashes, internal counters) and mass-assignment round trips.
 */

/** Id of a reference that may or may not have been populated. */
function refId(ref: Types.ObjectId | { _id: Types.ObjectId }): string {
  return ref instanceof Types.ObjectId ? ref.toHexString() : ref._id.toHexString();
}

function refName(ref: Types.ObjectId | { name?: string }): string | null {
  return ref instanceof Types.ObjectId ? null : (ref.name ?? null);
}

export interface BudgetSummary {
  budgetPaise: number;
  allocatedPaise: number;
  paidPaise: number;
  remainingPaise: number;
  /** Allocated / budget, 0–100 with one decimal. */
  utilizationPct: number;
}

export function budgetSummary(c: { budgetPaise: number; allocatedPaise: number; paidPaise?: number | null }): BudgetSummary {
  const remainingPaise = Math.max(0, c.budgetPaise - c.allocatedPaise);
  return {
    budgetPaise: c.budgetPaise,
    allocatedPaise: c.allocatedPaise,
    paidPaise: c.paidPaise ?? 0,
    remainingPaise,
    utilizationPct: c.budgetPaise > 0 ? Math.round((c.allocatedPaise / c.budgetPaise) * 1000) / 10 : 0,
  };
}

interface CampaignLike {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId | { _id: Types.ObjectId; name?: string };
  name: string;
  description?: string | null;
  platform: Platform;
  status: CampaignStatus;
  budgetPaise: number;
  allocatedPaise: number;
  paidPaise?: number | null;
  milestones: Milestone[];
  startsAt?: Date | null;
  endsAt?: Date | null;
  coverImageUrl?: string | null;
  coverTheme?: number | null;
  submissionCount?: number | null;
  publishedAt?: Date | null;
  completedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SubmissionWindow = { open: true; reason: null } | { open: false; reason: string };

export function submissionWindow(c: Pick<CampaignLike, "status" | "startsAt" | "endsAt" | "budgetPaise" | "allocatedPaise">, now = new Date()): SubmissionWindow {
  if (c.status === "DRAFT") return { open: false, reason: "This campaign hasn't been published yet." };
  if (c.status === "PAUSED") return { open: false, reason: "The brand has paused new submissions." };
  if (c.status === "COMPLETED") return { open: false, reason: "This campaign has ended." };
  if (c.startsAt && now < c.startsAt) return { open: false, reason: "Submissions open when the campaign starts." };
  if (c.endsAt && now > c.endsAt) return { open: false, reason: "The submission window has closed." };
  if (c.budgetPaise - c.allocatedPaise <= 0) return { open: false, reason: "The campaign budget has been fully allocated." };
  return { open: true, reason: null };
}

export function presentCampaign(c: CampaignLike, now = new Date()) {
  const window = submissionWindow(c, now);
  return {
    id: String(c._id),
    ownerId: refId(c.ownerId),
    brandName: refName(c.ownerId),
    name: c.name,
    description: c.description ?? "",
    platform: c.platform,
    status: c.status,
    milestones: c.milestones.map((m) => ({ views: m.views, payoutPaise: m.payoutPaise })),
    maxPayoutPaise: maxPayoutPaise(c.milestones),
    budget: budgetSummary(c),
    startsAt: c.startsAt ?? null,
    endsAt: c.endsAt ?? null,
    coverImageUrl: c.coverImageUrl ?? null,
    coverTheme: c.coverTheme ?? 0,
    submissionCount: c.submissionCount ?? 0,
    acceptingSubmissions: window.open,
    submissionsClosedReason: window.reason,
    publishedAt: c.publishedAt ?? null,
    completedAt: c.completedAt ?? null,
    createdAt: c.createdAt ?? null,
    updatedAt: c.updatedAt ?? null,
  };
}

export type CampaignView = ReturnType<typeof presentCampaign>;

interface SubmissionLike {
  _id: Types.ObjectId;
  campaignId: Types.ObjectId;
  creatorId: Types.ObjectId | { _id: Types.ObjectId; name?: string };
  platform: Platform;
  postId: string;
  canonicalUrl: string;
  status: SubmissionStatus;
  rejectedReason?: string | null;
  currentViews: number;
  lastViewUpdateAt?: Date | null;
  eligiblePaise: number;
  allocatedPaise: number;
  highestMilestoneIndex: number;
  fundingStatus: FundingStatus;
  underfundedSince?: Date | null;
  viewHistory?: { views: number; observedAt: Date }[];
  anomaly?: { flagged?: boolean | null; reason?: string | null; detectedAt?: Date | null; reviewedAt?: Date | null; flagCount?: number | null } | null;
  createdAt?: Date;
}

export function presentSubmission(
  s: SubmissionLike,
  milestones: Milestone[] | null,
  opts: { includeHistory?: boolean; campaign?: { id: string; name: string; status: CampaignStatus } } = {},
) {
  const resolution = milestones && milestones.length > 0 ? resolveMilestone(s.currentViews, milestones) : null;
  return {
    id: String(s._id),
    campaignId: String(s.campaignId),
    campaign: opts.campaign ?? null,
    creatorId: refId(s.creatorId),
    creatorName: refName(s.creatorId),
    platform: s.platform,
    postId: s.postId,
    postUrl: s.canonicalUrl,
    status: s.status,
    rejectedReason: s.rejectedReason ?? null,
    currentViews: s.currentViews,
    lastViewUpdateAt: s.lastViewUpdateAt ?? null,
    /** Entitlement per the milestone ladder. */
    eligiblePaise: s.eligiblePaise,
    /** Reserved from the campaign budget (accrued earnings). */
    allocatedPaise: s.allocatedPaise,
    /** Actually disbursed. Always 0 in this release: payouts are accrued, not transferred. */
    paidPaise: 0,
    shortfallPaise: Math.max(0, s.eligiblePaise - s.allocatedPaise),
    fundingStatus: s.fundingStatus,
    underfundedSince: s.underfundedSince ?? null,
    highestMilestone:
      resolution?.reached && milestones
        ? { index: resolution.reachedIndex, views: resolution.reached.views, payoutPaise: resolution.reached.payoutPaise }
        : null,
    nextMilestone: resolution?.next ? { views: resolution.next.views, payoutPaise: resolution.next.payoutPaise } : null,
    progressToNext: resolution?.progressToNext ?? 0,
    anomaly: {
      flagged: Boolean(s.anomaly?.flagged),
      reason: s.anomaly?.reason ?? null,
      detectedAt: s.anomaly?.detectedAt ?? null,
      reviewedAt: s.anomaly?.reviewedAt ?? null,
      flagCount: s.anomaly?.flagCount ?? 0,
    },
    viewHistory: opts.includeHistory ? (s.viewHistory ?? []).map((h) => ({ views: h.views, observedAt: h.observedAt })) : undefined,
    createdAt: s.createdAt ?? null,
  };
}

export type SubmissionView = ReturnType<typeof presentSubmission>;
