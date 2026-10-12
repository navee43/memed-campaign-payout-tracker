import { formatCompact, formatINR, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/types/api";

/**
 * The payout ladder — Meme'd's signature visual.
 *
 * Rungs stack bottom-up like the milestones they represent. Each rung's track
 * fills as views climb toward it, so the ladder is also a progress meter. Only
 * the highest rung reached carries the marigold "earning" tag; lower reached
 * rungs are shown as superseded, which is exactly the payout rule: the
 * highest milestone pays, they don't add up.
 *
 * Pass `views` to show progress. The component only DISPLAYS; any payout
 * amount shown comes from the ladder definition, not a client calculation of
 * earnings.
 */
export function MilestoneLadder({
  milestones,
  views,
  size = "md",
  className,
  caption,
}: {
  milestones: Milestone[];
  views?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
  caption?: React.ReactNode;
}) {
  const hasViews = typeof views === "number";
  let reached = -1;
  if (hasViews) milestones.forEach((m, i) => (views >= m.views ? (reached = i) : undefined));

  const rows = milestones.map((m, i) => {
    const floor = i === 0 ? 0 : (milestones[i - 1]?.views ?? 0);
    const fill = !hasViews ? 0 : views >= m.views ? 1 : views <= floor ? 0 : (views - floor) / (m.views - floor);
    return { m, i, fill, state: !hasViews ? "idle" : i === reached ? "earning" : i < reached ? "superseded" : fill > 0 ? "climbing" : "ahead" } as const;
  });

  const pad = size === "sm" ? "py-1.5" : size === "lg" ? "py-3" : "py-2";
  const tagSize = size === "lg" ? "min-w-28 px-3 py-1.5 text-lg" : size === "sm" ? "min-w-20 px-2 py-0.5 text-[13px]" : "min-w-24 px-2.5 py-1 text-[15px]";

  return (
    <figure className={cn("w-full", className)}>
      <ol className="flex flex-col-reverse" aria-label="Payout milestones">
        {rows.map(({ m, i, fill, state }) => (
          <li
            key={`${m.views}-${i}`}
            className={cn("grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3", pad)}
            aria-label={`${formatNumber(m.views)} views pays ${formatINR(m.payoutPaise)}${state === "earning" ? ", current payout" : state === "superseded" ? ", passed" : ""}`}
          >
            <span className={cn("tabular text-right font-semibold", size === "lg" ? "text-base" : "text-[13px]", state === "ahead" || state === "idle" ? "text-muted" : "text-ink")}>
              <span className="sm:hidden">{formatCompact(m.views)}</span>
              <span className="hidden sm:inline">{formatNumber(m.views)}</span>
              <span className="font-normal text-muted"> views</span>
            </span>

            <span className={cn("relative block overflow-hidden rounded-full", size === "lg" ? "h-3" : "h-2.5", state === "ahead" || state === "idle" ? "bg-line" : "bg-indigo-tint")}>
              <span
                className={cn("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out", state === "earning" ? "bg-ink" : "bg-indigo")}
                style={{ width: `${Math.round(fill * 1000) / 10}%` }}
              />
            </span>

            <span
              className={cn(
                "tabular inline-flex items-center justify-center rounded-md border font-bold transition-transform duration-300",
                tagSize,
                state === "earning" && "stripes -rotate-2 border-ink bg-marigold text-ink shadow-[2px_2px_0_var(--color-ink)]",
                state === "superseded" && "border-line bg-paper text-faint line-through decoration-2",
                state === "climbing" && "border-ink/40 bg-surface text-ink",
                (state === "ahead" || state === "idle") && "border-dashed border-line-strong bg-surface text-ink",
              )}
            >
              {formatINR(m.payoutPaise)}
            </span>
          </li>
        ))}
      </ol>
      {caption && <figcaption className="mt-3 text-[13px] text-muted">{caption}</figcaption>}
    </figure>
  );
}
