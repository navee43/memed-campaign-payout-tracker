/** Shapes returned by the Meme'd API (see backend/src/services/presenters.ts). */

export type Role = "BRAND" | "CREATOR";
export type Platform = "INSTAGRAM" | "YOUTUBE";
export type CampaignStatus = "DRAFT" | "LIVE" | "PAUSED" | "COMPLETED";
export type FundingStatus = "NOT_ELIGIBLE" | "FULLY_FUNDED" | "PARTIALLY_FUNDED" | "UNFUNDED";
export type SubmissionStatus = "ACTIVE" | "REJECTED";
export type LedgerType = "VIEW_MILESTONE" | "RECONCILIATION";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Milestone {
  views: number;
  payoutPaise: number;
}

export interface BudgetSummary {
  budgetPaise: number;
  allocatedPaise: number;
  paidPaise: number;
  remainingPaise: number;
  utilizationPct: number;
}

export interface Campaign {
  id: string;
  ownerId: string;
  brandName: string | null;
  name: string;
  description: string;
  platform: Platform;
  status: CampaignStatus;
  milestones: Milestone[];
  maxPayoutPaise: number;
  budget: BudgetSummary;
  startsAt: string | null;
  endsAt: string | null;
  coverImageUrl: string | null;
  coverTheme: number;
  submissionCount: number;
  acceptingSubmissions: boolean;
  submissionsClosedReason: string | null;
  publishedAt: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Anomaly {
  flagged: boolean;
  reason: string | null;
  detectedAt: string | null;
  reviewedAt: string | null;
  flagCount: number;
}

export interface Submission {
  id: string;
  campaignId: string;
  campaign: { id: string; name: string; status: CampaignStatus } | null;
  creatorId: string;
  creatorName: string | null;
  platform: Platform;
  postId: string;
  postUrl: string;
  status: SubmissionStatus;
  rejectedReason: string | null;
  currentViews: number;
  lastViewUpdateAt: string | null;
  eligiblePaise: number;
  allocatedPaise: number;
  paidPaise: number;
  shortfallPaise: number;
  fundingStatus: FundingStatus;
  underfundedSince: string | null;
  highestMilestone: { index: number; views: number; payoutPaise: number } | null;
  nextMilestone: Milestone | null;
  progressToNext: number;
  anomaly: Anomaly;
  viewHistory?: { views: number; observedAt: string }[];
  createdAt: string | null;
}

export interface SubmissionDetail extends Submission {
  milestones: Milestone[];
  ledger: { id: string; sequence: number; type: LedgerType; amountPaise: number; viewsAtAllocation: number; partial: boolean; createdAt: string }[];
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paged<T> {
  items: T[];
  meta: PageMeta;
}

export interface LedgerEntry {
  id: string;
  allocationKey: string;
  type: LedgerType;
  amountPaise: number;
  partial: boolean;
  submissionId: string;
  postUrl: string;
  creatorName: string;
  viewsAtAllocation: number;
  eligiblePaiseAfter: number;
  allocatedPaiseAfter: number;
  campaignAllocatedPaiseAfter: number;
  sourceEventId: string;
  createdAt: string;
}

export interface CampaignAnalytics {
  campaign: Campaign;
  budget: BudgetSummary;
  totals: {
    submissions: number;
    views: number;
    eligiblePaise: number;
    allocatedPaise: number;
    unfundedEntitlementPaise: number;
    flaggedSubmissions: number;
    unreviewedFlags: number;
  };
  fundingBreakdown: Partial<Record<FundingStatus, number>>;
  milestoneDistribution: { label: string; views: number; payoutPaise: number; count: number }[];
  dailyAllocations: { date: string; amountPaise: number; entries: number }[];
  topSubmissions: Submission[];
  integrity: {
    consistent: boolean;
    campaignAllocatedPaise: number;
    ledgerTotalPaise: number;
    submissionsAllocatedPaise: number;
    withinBudget: boolean;
    mismatchedSubmissions: number;
  };
}

export interface EarningActivity {
  id: string;
  type: LedgerType;
  amountPaise: number;
  partial: boolean;
  campaignId: string;
  campaignName: string;
  submissionId: string;
  viewsAtAllocation: number;
  createdAt: string;
}

export interface EarningsSummary {
  totals: {
    submissions: number;
    activeSubmissions: number;
    views: number;
    eligiblePaise: number;
    allocatedPaise: number;
    paidPaise: number;
    awaitingBudgetPaise: number;
    underfundedSubmissions: number;
  };
  byCampaign: { campaignId: string; name: string; status: CampaignStatus; submissions: number; views: number; eligiblePaise: number; allocatedPaise: number }[];
  topSubmission: Submission | null;
  recentActivity: EarningActivity[];
}

export interface EarningsHistory {
  items: EarningActivity[];
  daily: { date: string; amountPaise: number }[];
  meta: PageMeta;
}

export interface ViewUpdateResult {
  outcome: "UPDATED" | "UNCHANGED";
  submission: Submission;
  allocation: { requiredPaise: number; grantedPaise: number; partial: boolean; ledgerEntryId: string | null };
  campaign: { id: string; status: string } & BudgetSummary;
  anomaly: { flagged: boolean; newlyFlagged: boolean; reason: string | null };
  idempotentReplay: boolean;
}

export interface PublicConfig {
  viewUpdateMode: "internal" | "simulation";
  viewSimulationEnabled: boolean;
}

export interface BrandSummary {
  campaignsByStatus: Partial<Record<CampaignStatus, number>>;
  budget: BudgetSummary;
  submissions: { count: number; views: number; unreviewedFlags: number };
  activeCampaigns: Campaign[];
  recentAllocations: {
    id: string;
    type: LedgerType;
    amountPaise: number;
    partial: boolean;
    campaignId: string;
    campaignName: string;
    creatorName: string;
    submissionId: string;
    createdAt: string;
  }[];
}
