import { Info } from "lucide-react";
import { formatINR, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { BudgetSummary } from "@/types/api";

/**
 * Budget breakdown. "Committed" is money reserved for creators by the payout
 * engine (accrued earnings). "Paid out" is real disbursement, which this
 * release does not perform — the UI says so instead of implying transfers.
 */
export function BudgetMeter({ budget, compact = false, className }: { budget: BudgetSummary; compact?: boolean; className?: string }) {
  const pct = budget.budgetPaise > 0 ? Math.min(100, (budget.allocatedPaise / budget.budgetPaise) * 100) : 0;
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        className="relative h-3 overflow-hidden rounded-full bg-line"
        role="meter"
        aria-label="Budget committed to creators"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
      >
        <div className="stripes absolute inset-y-0 left-0 rounded-full bg-marigold transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      {compact ? (
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="tabular font-semibold">{formatINR(budget.remainingPaise)} left</span>
          <span className="tabular text-muted">{formatPercent(budget.utilizationPct)} committed</span>
        </div>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            <Stat label="Total budget" value={formatINR(budget.budgetPaise)} />
            <Stat label="Committed" value={formatINR(budget.allocatedPaise)} dot="bg-marigold" />
            <Stat label="Remaining" value={formatINR(budget.remainingPaise)} dot="bg-line-strong" />
            <Stat label="Utilisation" value={formatPercent(budget.utilizationPct)} />
          </dl>
          <p className="flex items-start gap-2 rounded-md bg-paper px-3 py-2 text-[13px] text-muted">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Paid out: <span className="tabular font-semibold text-ink">{formatINR(budget.paidPaise)}</span>. Committed amounts are accrued creator earnings; bank
              disbursement isn’t connected in this release.
            </span>
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, dot }: { label: string; value: string; dot?: string }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[13px] text-muted">
        {dot && <span className={cn("inline-block size-2 rounded-full", dot)} aria-hidden />}
        {label}
      </dt>
      <dd className="tabular mt-0.5 text-lg font-bold">{value}</dd>
    </div>
  );
}
