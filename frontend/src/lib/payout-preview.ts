import type { Milestone } from "@/types/api";

/**
 * PREVIEW ONLY: mirrors the backend rule (highest milestone reached wins) so
 * the landing-page demo and the campaign wizard can show a live preview while
 * someone types. Real earnings always come from the API.
 */
export function previewPayout(views: number, milestones: Milestone[]): { payoutPaise: number; reachedIndex: number } {
  let reachedIndex = -1;
  milestones.forEach((m, i) => {
    if (views >= m.views) reachedIndex = i;
  });
  return { payoutPaise: reachedIndex >= 0 ? (milestones[reachedIndex]?.payoutPaise ?? 0) : 0, reachedIndex };
}
