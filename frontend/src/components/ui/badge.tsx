import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-5 whitespace-nowrap [&_svg]:size-3.5", {
  variants: {
    tone: {
      neutral: "bg-paper text-muted ring-1 ring-inset ring-line",
      indigo: "bg-indigo-tint text-indigo",
      success: "bg-success-tint text-success",
      warn: "bg-marigold-tint text-marigold-deep",
      danger: "bg-danger-tint text-danger",
      ink: "bg-ink text-white",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
