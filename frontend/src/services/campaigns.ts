import { api, apiData } from "@/lib/api";
import type { BrandSummary, Campaign, CampaignAnalytics, CampaignStatus, LedgerEntry, Milestone, Paged, Platform, Submission, FundingStatus } from "@/types/api";

export interface CampaignListQuery {
  page?: number;
  pageSize?: number;
  status?: CampaignStatus;
  platform?: Platform;
  search?: string;
  minPayoutPaise?: number;
  minRemainingPaise?: number;
  sort?: "newest" | "budget" | "payout";
}

export interface CampaignInput {
  name: string;
  description: string;
  platform: Platform;
  budgetPaise: number;
  milestones: Milestone[];
  startsAt: string | null;
  endsAt: string | null;
  coverImageUrl: string | null;
  coverTheme: number;
  status?: "DRAFT" | "LIVE";
}

export type CampaignPatch = Partial<Omit<CampaignInput, "status">> & { status?: CampaignStatus };

export interface SubmissionListQuery {
  page?: number;
  pageSize?: number;
  fundingStatus?: FundingStatus;
  flagged?: boolean;
  sort?: "newest" | "views" | "earnings";
  campaignId?: string;
}

async function paged<T>(path: string, query: object): Promise<Paged<T>> {
  const res = await api<{ items: T[] }>(path, { query: query as Record<string, string | number | boolean | undefined> });
  return { items: res.data.items, meta: res.meta ?? { page: 1, pageSize: res.data.items.length, total: res.data.items.length, totalPages: 1 } };
}

export const campaignService = {
  brandSummary: () => apiData<BrandSummary>("/brand/summary"),
  list: (q: CampaignListQuery = {}) => paged<Campaign>("/campaigns", q),
  get: (id: string) => apiData<{ campaign: Campaign }>(`/campaigns/${id}`).then((d) => d.campaign),
  create: (input: CampaignInput) => apiData<{ campaign: Campaign }>("/campaigns", { method: "POST", body: input }).then((d) => d.campaign),
  update: (id: string, patch: CampaignPatch) => apiData<{ campaign: Campaign }>(`/campaigns/${id}`, { method: "PATCH", body: patch }).then((d) => d.campaign),
  topUp: (id: string, amountPaise: number) =>
    apiData<{ campaign: Campaign; reconciliation: { allocatedPaise: number; submissionsFunded: number; remainingPaise: number } }>(`/campaigns/${id}/budget/top-ups`, {
      method: "POST",
      body: { amountPaise },
    }),
  reconcile: (id: string) =>
    apiData<{ reconciliation: { allocatedPaise: number; submissionsFunded: number; remainingPaise: number } }>(`/campaigns/${id}/reconcile`, { method: "POST" }),
  analytics: (id: string) => apiData<CampaignAnalytics>(`/campaigns/${id}/analytics`),
  submissions: (id: string, q: SubmissionListQuery = {}) => paged<Submission>(`/campaigns/${id}/submissions`, q),
  ledger: (id: string, q: { page?: number; pageSize?: number } = {}) => paged<LedgerEntry>(`/campaigns/${id}/payout-ledger`, q),
  submit: (id: string, postUrl: string) =>
    apiData<{ submission: Submission }>(`/campaigns/${id}/submissions`, { method: "POST", body: { postUrl } }).then((d) => d.submission),
};
