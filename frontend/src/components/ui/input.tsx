import * as React from "react";
import { cn } from "@/lib/utils";

export const fieldBase =
  "w-full rounded-md border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-faint transition-colors focus-visible:border-indigo focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo/30 disabled:bg-paper disabled:text-muted aria-[invalid=true]:border-danger";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(fieldBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea className={cn(fieldBase, "min-h-24 py-2 leading-relaxed", className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return <label className={cn("text-sm font-semibold text-ink", className)} {...props} />;
}

export function FieldError({ id, children }: { id?: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-[13px] font-medium text-danger">
      {children}
    </p>
  );
}

export function FieldHint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="text-[13px] text-muted">
      {children}
    </p>
  );
}

/** Label + control + hint/error, wired up with aria attributes. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <FieldError id={`${htmlFor}-error`}>{error}</FieldError> : hint ? <FieldHint id={`${htmlFor}-hint`}>{hint}</FieldHint> : null}
    </div>
  );
}
