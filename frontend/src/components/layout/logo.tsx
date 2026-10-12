import Link from "next/link";
import { cn } from "@/lib/utils";

/** Wordmark: condensed heavy lowercase, the apostrophe is the brand's marigold "tick". */
export function Logo({ tone = "ink", className, href = "/" }: { tone?: "ink" | "white"; className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-baseline rounded-sm font-display text-[28px] leading-none", tone === "white" ? "text-white" : "text-ink", className)} aria-label="Meme'd home">
      meme<span className="text-marigold" aria-hidden>’</span>d
    </Link>
  );
}
