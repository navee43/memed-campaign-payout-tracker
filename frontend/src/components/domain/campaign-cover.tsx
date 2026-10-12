import { cn } from "@/lib/utils";

/**
 * Six original cover patterns (no stock art, no logos). A brand can also
 * supply its own https image; it is loaded without a referrer.
 */
const THEMES = [
  { bg: "#3a2fd3", fg: "#ffb21e", pattern: "dots" },
  { bg: "#17123a", fg: "#ffb21e", pattern: "stripes" },
  { bg: "#ffb21e", fg: "#17123a", pattern: "grid" },
  { bg: "#0b7a50", fg: "#e2f5ec", pattern: "dots" },
  { bg: "#c62f3b", fg: "#fff3d6", pattern: "stripes" },
  { bg: "#ecebfd", fg: "#3a2fd3", pattern: "grid" },
] as const;

export const COVER_THEME_COUNT = THEMES.length;

function patternStyle(theme: (typeof THEMES)[number]): React.CSSProperties {
  const { bg, fg, pattern } = theme;
  if (pattern === "dots") return { backgroundColor: bg, backgroundImage: `radial-gradient(${fg} 1.6px, transparent 1.7px)`, backgroundSize: "14px 14px" };
  if (pattern === "stripes") return { backgroundColor: bg, backgroundImage: `repeating-linear-gradient(135deg, ${fg} 0 3px, transparent 3px 16px)` };
  return {
    backgroundColor: bg,
    backgroundImage: `linear-gradient(${fg}55 1px, transparent 1px), linear-gradient(90deg, ${fg}55 1px, transparent 1px)`,
    backgroundSize: "18px 18px",
  };
}

export function CampaignCover({ theme = 0, imageUrl, name, className, children }: { theme?: number; imageUrl?: string | null; name: string; className?: string; children?: React.ReactNode }) {
  const t = THEMES[((theme % THEMES.length) + THEMES.length) % THEMES.length]!;
  return (
    <div className={cn("relative overflow-hidden", className)} style={patternStyle(t)}>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- brand-supplied remote image; next/image would proxy arbitrary hosts
        <img src={imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="absolute inset-0 size-full object-cover" />
      )}
      <span className="sr-only">{name} cover</span>
      {children}
    </div>
  );
}

export function CoverSwatch({ theme, selected, onSelect }: { theme: number; selected: boolean; onSelect: () => void }) {
  const t = THEMES[theme]!;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Cover style ${theme + 1}`}
      className={cn("h-14 w-20 rounded-md ring-offset-2 transition-shadow", selected ? "ring-2 ring-indigo" : "ring-1 ring-line hover:ring-line-strong")}
      style={patternStyle(t)}
    />
  );
}
