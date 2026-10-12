import * as React from "react";
import { cn } from "@/lib/utils";

/** The basic surface. Bordered, not shadowed: shadows are reserved for things that float. */
export function Panel({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({ title, description, action, className }: { title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PanelBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}
