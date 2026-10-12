import { cn } from "@/lib/utils";

/** A labelled figure. `money` renders the figure with the marigold underline reserved for earnings. */
export function Metric({ label, value, hint, money = false, className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; money?: boolean; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[13px] text-muted">{label}</div>
      <div className={cn("tabular mt-1 font-display-wide text-[28px] leading-none", money && "underline decoration-marigold decoration-[5px] underline-offset-[6px]")}>{value}</div>
      {hint && <div className="mt-2 text-[13px] text-muted">{hint}</div>}
    </div>
  );
}
