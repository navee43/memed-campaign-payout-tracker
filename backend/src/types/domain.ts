export const ROLES = ["BRAND", "CREATOR"] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const PLATFORMS = ["INSTAGRAM", "YOUTUBE"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const CAMPAIGN_STATUSES = ["DRAFT", "LIVE", "PAUSED", "COMPLETED"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * NOT_ELIGIBLE      – no milestone reached yet
 * FULLY_FUNDED      – allocated == eligible
 * PARTIALLY_FUNDED  – 0 < allocated < eligible (campaign budget ran short)
 * UNFUNDED          – eligible > 0 but nothing could be allocated (budget exhausted)
 */
export const FUNDING_STATUSES = ["NOT_ELIGIBLE", "FULLY_FUNDED", "PARTIALLY_FUNDED", "UNFUNDED"] as const;
export type FundingStatus = (typeof FUNDING_STATUSES)[number];

export const SUBMISSION_STATUSES = ["ACTIVE", "REJECTED"] as const;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];

/**
 * VIEW_MILESTONE  – allocation triggered by a view update crossing milestones
 * RECONCILIATION  – back-fill of an under-funded submission after budget became available
 */
export const LEDGER_TYPES = ["VIEW_MILESTONE", "RECONCILIATION"] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number];

export interface Milestone {
  views: number;
  payoutPaise: number;
}

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
  email: string;
}
