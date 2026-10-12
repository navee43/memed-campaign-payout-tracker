"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({
  title,
  description,
  children,
  className,
  side = "center",
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  side?: "center" | "left";
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-ink/45 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <D.Content
        className={cn(
          "fixed z-50 bg-surface shadow-pop focus:outline-none",
          side === "center"
            ? "left-1/2 top-1/2 max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6 data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
            : "inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto p-0 data-[state=open]:animate-in data-[state=open]:slide-in-from-left",
          className,
        )}
      >
        <div className={cn(side === "left" && "sr-only")}>
          <D.Title className="pr-8 text-xl font-bold">{title}</D.Title>
          {description ? <D.Description className="mt-1 text-sm text-muted">{description}</D.Description> : <D.Description className="sr-only">{title}</D.Description>}
        </div>
        <div className={cn(side === "center" && "mt-5")}>{children}</div>
        <D.Close className="absolute right-3 top-3 rounded-md p-1.5 text-muted hover:bg-paper hover:text-ink" aria-label="Close">
          <X className="size-5" />
        </D.Close>
      </D.Content>
    </D.Portal>
  );
}
