"use client";

import { useId, useState } from "react";
import { MilestoneLadder } from "@/components/domain/milestone-ladder";
import { formatINR, formatNumber } from "@/lib/format";
import { previewPayout } from "@/lib/payout-preview";
import type { Milestone } from "@/types/api";

const LADDER: Milestone[] = [
  { views: 10_000, payoutPaise: 50_000 },
  { views: 50_000, payoutPaise: 2_00_000 },
  { views: 1_00_000, payoutPaise: 5_00_000 },
];

/** Interactive explainer on the landing page. Illustrative numbers, computed with the same rule the API uses. */
export function LadderDemo() {
  const [views, setViews] = useState(65_000);
  const id = useId();
  const { payoutPaise, reachedIndex } = previewPayout(views, LADDER);
  const below = LADDER.slice(0, Math.max(0, reachedIndex));
  const naiveSum = LADDER.slice(0, reachedIndex + 1).reduce((s, m) => s + m.payoutPaise, 0);

  return (
    <div className="rounded-xl border-2 border-ink bg-surface p-5 shadow-[6px_6px_0_var(--color-ink)] sm:p-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <label htmlFor={id} className="text-sm font-semibold text-muted">
            Drag to set a post’s views
          </label>
          <output htmlFor={id} className="tabular mt-1 block font-display text-5xl" aria-live="polite">
            {formatNumber(views)}
          </output>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold text-muted">Creator earns</div>
          <div className="tabular mt-1 font-display text-5xl underline decoration-marigold decoration-[6px] underline-offset-[7px]">{formatINR(payoutPaise)}</div>
        </div>
      </div>

      <input
        id={id}
        type="range"
        min={0}
        max={150_000}
        step={500}
        value={views}
        onChange={(e) => setViews(Number(e.target.value))}
        className="mt-6 w-full accent-indigo"
        aria-valuetext={`${formatNumber(views)} views, earns ${formatINR(payoutPaise)}`}
      />

      <MilestoneLadder milestones={LADDER} views={views} size="lg" className="mt-4" />

      <p className="mt-4 min-h-[3rem] text-sm text-muted">
        {reachedIndex < 0
          ? `No milestone yet. ${formatNumber(LADDER[0]!.views - views)} more views unlock the first payout.`
          : below.length > 0
            ? `The highest milestone pays: ${formatINR(payoutPaise)}, not ${formatINR(naiveSum)}. Lower milestones are replaced, not added.`
            : `First milestone reached. The next one replaces this payout with a bigger one.`}
      </p>
    </div>
  );
}
