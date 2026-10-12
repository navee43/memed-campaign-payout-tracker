"use client";

import { Select as S } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase } from "./input";

export interface Option<T extends string> {
  value: T;
  label: string;
}

/** Accessible single-select. Use the sentinel "all" for an empty choice (Radix disallows ""). */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: Option<T>[];
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <S.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <S.Trigger id={id} aria-label={ariaLabel} className={cn(fieldBase, "flex h-10 items-center justify-between gap-2 text-left", className)}>
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 text-muted" />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content position="popper" sideOffset={6} className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-line bg-surface p-1 shadow-pop">
          <S.Viewport>
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex cursor-pointer select-none items-center rounded-sm py-2 pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-indigo-tint data-[highlighted]:text-indigo"
              >
                <S.ItemIndicator className="absolute left-2">
                  <Check className="size-4" />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
