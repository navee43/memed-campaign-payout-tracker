"use client";

import { DropdownMenu as M } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dropdown = M.Root;
export const DropdownTrigger = M.Trigger;

export function DropdownContent({ className, ...props }: React.ComponentProps<typeof M.Content>) {
  return (
    <M.Portal>
      <M.Content sideOffset={6} align="end" className={cn("z-50 min-w-44 rounded-md border border-line bg-surface p-1 shadow-pop", className)} {...props} />
    </M.Portal>
  );
}

export function DropdownItem({ className, ...props }: React.ComponentProps<typeof M.Item>) {
  return (
    <M.Item
      className={cn(
        "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-indigo-tint data-[highlighted]:text-indigo [&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

export const DropdownSeparator = () => <M.Separator className="my-1 h-px bg-line" />;
