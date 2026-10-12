import { Camera, Clapperboard } from "lucide-react";
import type { Platform } from "@/types/api";
import { cn } from "@/lib/utils";

export const PLATFORM_LABEL: Record<Platform, string> = { INSTAGRAM: "Instagram", YOUTUBE: "YouTube" };

/** Generic glyphs (not the platforms' trademarked logos). */
export function PlatformIcon({ platform, className }: { platform: Platform; className?: string }) {
  const Icon = platform === "INSTAGRAM" ? Camera : Clapperboard;
  return <Icon className={cn("size-4", className)} aria-hidden />;
}

export function PlatformTag({ platform, className }: { platform: Platform; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted", className)}>
      <PlatformIcon platform={platform} /> {PLATFORM_LABEL[platform]}
    </span>
  );
}
