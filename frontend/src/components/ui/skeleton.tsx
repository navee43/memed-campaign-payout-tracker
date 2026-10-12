import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-line/70", className)} />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
