import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, className, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string; children?: React.ReactNode }) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="min-w-0 max-w-2xl">
        {children}
        <h1 className="font-display text-[40px] sm:text-[48px]">{title}</h1>
        {description && <p className="mt-2 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
