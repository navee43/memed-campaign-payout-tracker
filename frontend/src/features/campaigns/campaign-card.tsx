import Link from "next/link";
import { CampaignCover } from "@/components/domain/campaign-cover";
import { PlatformTag } from "@/components/domain/platform";
import { Progress } from "@/components/ui/progress";
import { formatCompact, formatINR } from "@/lib/format";
import type { Campaign } from "@/types/api";

/** Discovery card. The whole card is one link; its content reads in a sensible order for screen readers. */
export function CampaignCard({ campaign: c }: { campaign: Campaign }) {
  const first = c.milestones[0];
  return (
    <Link
      href={`/creator/campaigns/${c.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-indigo"
    >
      <CampaignCover theme={c.coverTheme} imageUrl={c.coverImageUrl} name={c.name} className="h-24">
        <span className="absolute bottom-3 left-3 rounded-md border-2 border-ink bg-marigold px-2 py-0.5 text-[13px] font-bold text-ink shadow-[2px_2px_0_var(--color-ink)]">
          Up to {formatINR(c.maxPayoutPaise)}
        </span>
      </CampaignCover>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <PlatformTag platform={c.platform} />
          {!c.acceptingSubmissions && <span className="text-[12px] font-semibold text-danger">Closed</span>}
        </div>
        <h3 className="mt-2 text-lg font-bold leading-snug group-hover:text-indigo">{c.name}</h3>
        <p className="text-sm text-muted">{c.brandName ?? "Brand"}</p>
        <p className="mt-3 line-clamp-2 text-sm">{c.description || "No brief provided."}</p>
        <p className="mt-3 text-[13px] text-muted">
          {c.milestones.length} milestone{c.milestones.length === 1 ? "" : "s"}
          {first ? `, first pays ${formatINR(first.payoutPaise)} at ${formatCompact(first.views)} views` : ""}
        </p>
        <div className="mt-auto pt-4">
          <Progress value={1 - c.budget.utilizationPct / 100} tone="marigold" label="Budget remaining" />
          <p className="tabular mt-1.5 text-[13px]">
            <span className="font-semibold">{formatINR(c.budget.remainingPaise)}</span> <span className="text-muted">left of {formatINR(c.budget.budgetPaise)}</span>
          </p>
        </div>
      </div>
    </Link>
  );
}
