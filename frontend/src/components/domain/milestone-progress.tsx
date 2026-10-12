import { formatCompact, formatINR } from "@/lib/format";
import type { Submission } from "@/types/api";
import { Progress } from "../ui/progress";

/** Compact "where is this post on the ladder" readout for tables and cards. */
export function MilestoneProgress({ submission }: { submission: Submission }) {
  const { highestMilestone: reached, nextMilestone: next, progressToNext } = submission;
  return (
    <div className="min-w-40">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-semibold">{reached ? `${formatCompact(reached.views)} reached` : "No milestone yet"}</span>
        {next ? <span className="tabular text-muted">next {formatCompact(next.views)}</span> : <span className="text-success">Top milestone</span>}
      </div>
      <Progress
        className="mt-1.5"
        value={next ? progressToNext : 1}
        tone={next ? "indigo" : "success"}
        label={next ? `Progress to ${formatCompact(next.views)} views (${formatINR(next.payoutPaise)})` : "Top milestone reached"}
      />
    </div>
  );
}
