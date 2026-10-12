import { AlertTriangle, RefreshCw } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";

export function EmptyState({ icon, title, children, action, className }: { icon?: React.ReactNode; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-start gap-3 rounded-lg border border-dashed border-line-strong bg-surface px-6 py-10 sm:items-center sm:text-center", className)}>
      {icon && <div className="grid size-11 place-items-center rounded-full bg-indigo-tint text-indigo [&_svg]:size-5">{icon}</div>}
      <h3 className="text-lg font-bold">{title}</h3>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-start gap-3 rounded-lg border border-danger/30 bg-danger-tint px-5 py-5", className)}>
      <div className="flex items-center gap-2 font-semibold text-danger">
        <AlertTriangle className="size-5" aria-hidden /> Couldn’t load this
      </div>
      <p className="text-sm text-ink">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </div>
  );
}
