import { cn } from "@/lib/utils";

/** Static progress bar (value 0..1). The fill colour carries meaning: marigold = money. */
export function Progress({ value, tone = "indigo", className, label }: { value: number; tone?: "indigo" | "marigold" | "success" | "danger"; className?: string; label: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 1000) / 10;
  const fill = { indigo: "bg-indigo", marigold: "bg-marigold", success: "bg-success", danger: "bg-danger" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className={cn("h-2 w-full overflow-hidden rounded-full bg-line/80", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
