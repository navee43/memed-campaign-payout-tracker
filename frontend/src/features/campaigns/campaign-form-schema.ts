import { z } from "zod";
import { paiseToRupeesInput, rupeesInputToPaise, viewsInputToNumber } from "@/lib/format";
import type { Campaign, Milestone, Platform } from "@/types/api";
import type { CampaignInput } from "@/services/campaigns";

/**
 * Form values are strings (what people type). They are converted to integer
 * paise / view counts only at submit time, with string arithmetic. The API
 * re-validates everything.
 */
export const milestoneRow = z.object({ views: z.string(), payout: z.string() });

export const campaignFormSchema = z
  .object({
    name: z.string().trim().min(3, "Use at least 3 characters").max(100, "Use at most 100 characters"),
    description: z.string().trim().max(2000, "Keep the brief under 2,000 characters"),
    platform: z.enum(["INSTAGRAM", "YOUTUBE"]),
    coverTheme: z.number().int().min(0).max(5),
    coverImageUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((v) => v === "" || /^https:\/\/[^\s]+$/i.test(v), "Use an https:// image link, or leave it empty"),
    milestones: z.array(milestoneRow).min(1, "Add at least one milestone").max(20, "Up to 20 milestones"),
    budget: z.string(),
    startsAt: z.string(),
    endsAt: z.string(),
  })
  .superRefine((v, ctx) => {
    let prev: { views: number; payout: number } | null = null;
    v.milestones.forEach((m, i) => {
      const views = viewsInputToNumber(m.views);
      const payout = rupeesInputToPaise(m.payout);
      if (views === null || views <= 0) ctx.addIssue({ code: "custom", path: ["milestones", i, "views"], message: "Enter a whole number of views" });
      if (payout === null || payout <= 0) ctx.addIssue({ code: "custom", path: ["milestones", i, "payout"], message: "Enter an amount like 500 or 499.50" });
      if (views !== null && payout !== null && prev) {
        if (views <= prev.views) ctx.addIssue({ code: "custom", path: ["milestones", i, "views"], message: "Must be more views than the milestone above" });
        if (payout < prev.payout) ctx.addIssue({ code: "custom", path: ["milestones", i, "payout"], message: "Can’t pay less than a lower milestone" });
      }
      if (views !== null && payout !== null) prev = { views, payout };
    });

    const budget = rupeesInputToPaise(v.budget);
    if (budget === null || budget <= 0) ctx.addIssue({ code: "custom", path: ["budget"], message: "Enter the total budget in rupees" });
    const top = Math.max(0, ...v.milestones.map((m) => rupeesInputToPaise(m.payout) ?? 0));
    if (budget !== null && top > budget) ctx.addIssue({ code: "custom", path: ["budget"], message: "Budget must cover at least one top payout" });

    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "End must be after the start" });
    }
  });

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;

export const EMPTY_FORM: CampaignFormValues = {
  name: "",
  description: "",
  platform: "INSTAGRAM",
  coverTheme: 0,
  coverImageUrl: "",
  milestones: [
    { views: "10000", payout: "500" },
    { views: "50000", payout: "2000" },
    { views: "100000", payout: "5000" },
  ],
  budget: "25000",
  startsAt: "",
  endsAt: "",
};

/** <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm". */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formFromCampaign(c: Campaign): CampaignFormValues {
  return {
    name: c.name,
    description: c.description,
    platform: c.platform,
    coverTheme: c.coverTheme,
    coverImageUrl: c.coverImageUrl ?? "",
    milestones: c.milestones.map((m) => ({ views: String(m.views), payout: paiseToRupeesInput(m.payoutPaise) })),
    budget: paiseToRupeesInput(c.budget.budgetPaise),
    startsAt: toLocalInput(c.startsAt),
    endsAt: toLocalInput(c.endsAt),
  };
}

export function parsedMilestones(rows: { views: string; payout: string }[]): Milestone[] {
  return rows
    .map((r) => ({ views: viewsInputToNumber(r.views) ?? 0, payoutPaise: rupeesInputToPaise(r.payout) ?? 0 }))
    .filter((m) => m.views > 0 && m.payoutPaise > 0);
}

export function toCampaignInput(v: CampaignFormValues): Omit<CampaignInput, "status"> {
  return {
    name: v.name.trim(),
    description: v.description.trim(),
    platform: v.platform as Platform,
    coverTheme: v.coverTheme,
    coverImageUrl: v.coverImageUrl.trim() || null,
    milestones: parsedMilestones(v.milestones),
    budgetPaise: rupeesInputToPaise(v.budget) ?? 0,
    startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : null,
    endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : null,
  };
}
