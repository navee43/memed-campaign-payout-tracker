import { api, apiData } from "@/lib/api";
import type { EarningsHistory, EarningsSummary, Paged, PublicConfig, Submission, SubmissionDetail, ViewUpdateResult } from "@/types/api";
import type { SubmissionListQuery } from "./campaigns";

export const submissionService = {
  mine: async (q: SubmissionListQuery = {}): Promise<Paged<Submission>> => {
    const res = await api<{ items: Submission[] }>("/submissions/mine", { query: q as Record<string, string | number | boolean | undefined> });
    return { items: res.data.items, meta: res.meta! };
  },
  get: (id: string) => apiData<{ submission: SubmissionDetail }>(`/submissions/${id}`).then((d) => d.submission),
  reject: (id: string, reason: string) => apiData<{ id: string }>(`/submissions/${id}/reject`, { method: "POST", body: { reason } }),
  acknowledgeAnomaly: (id: string) => apiData<{ id: string }>(`/submissions/${id}/anomaly/acknowledge`, { method: "POST" }),
  /** Only works when the API runs in simulation mode (local/demo). */
  simulateViews: (id: string, views: number) => apiData<ViewUpdateResult>(`/submissions/${id}/views`, { method: "PATCH", body: { views } }),
};

export const earningsService = {
  summary: () => apiData<EarningsSummary>("/earnings/summary"),
  history: async (q: { page?: number; pageSize?: number; days?: number } = {}): Promise<EarningsHistory> => {
    const res = await api<{ items: EarningsHistory["items"]; daily: EarningsHistory["daily"] }>("/earnings/history", { query: q });
    return { ...res.data, meta: res.meta! };
  },
};

export const configService = {
  get: () => apiData<PublicConfig>("/config"),
};
