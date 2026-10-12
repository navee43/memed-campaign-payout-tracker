import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-colors disabled:pointer-events-none disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-indigo text-white hover:bg-indigo-hover",
        ink: "bg-ink text-white hover:bg-ink-soft",
        outline: "border border-line-strong bg-surface text-ink hover:border-ink hover:bg-paper",
        ghost: "text-ink hover:bg-indigo-tint",
        danger: "bg-danger text-white hover:bg-danger/90",
        marigold: "bg-marigold text-ink hover:bg-[#f5a400]",
        link: "text-indigo underline-offset-4 hover:underline px-0 h-auto",
      },
      size: {
        sm: "h-8 rounded-md px-3 text-[13px]",
        md: "h-10 rounded-md px-4 text-sm",
        lg: "h-12 rounded-lg px-6 text-[15px]",
        icon: "size-9 rounded-md",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export function Button({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { buttonVariants };
