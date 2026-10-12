/**
 * View-spike heuristic.
 *
 * This is a HEURISTIC, not proof of fraud. Legitimate posts do go viral, so a
 * flag only asks a human to take a look: it never deletes a submission, never
 * reverses earnings and never blocks an allocation.
 *
 * Two rules, both configurable:
 *  1. Rate rule (needs history): the latest increase is at least
 *     `minIncrease` views, happened within `windowMs`, and its hourly rate is at
 *     least `rateMultiplier` times the submission's own historical rate.
 *  2. Absolute ceiling (works without history): more than `absoluteCeiling`
 *     views gained inside `windowMs`.
 */

export interface ViewSnapshot {
  views: number;
  observedAt: Date;
}

export interface SpikeConfig {
  windowMs: number;
  minIncrease: number;
  rateMultiplier: number;
  /** Minimum number of prior snapshots needed before the rate rule is applied. */
  minHistory: number;
  absoluteCeiling: number;
}

export type SpikeStatus = "NORMAL" | "SPIKE" | "INSUFFICIENT_HISTORY";

export interface SpikeResult {
  status: SpikeStatus;
  flagged: boolean;
  reason: string | null;
  metrics: {
    recentIncrease: number;
    recentMinutes: number;
    recentRatePerHour: number;
    baselineRatePerHour: number | null;
    windowIncrease: number;
  };
}

const HOUR_MS = 3_600_000;
/** Treat intervals shorter than a minute as one minute so rates stay finite. */
const MIN_INTERVAL_MS = 60_000;
/** Baseline floor so a flat history doesn't make every increase infinite. */
const MIN_BASELINE_RATE = 1;

const fmt = new Intl.NumberFormat("en-IN");

export function detectViewSpike(
  priorHistory: readonly ViewSnapshot[],
  current: ViewSnapshot,
  config: SpikeConfig,
): SpikeResult {
  const history = priorHistory
    .filter((s) => s.observedAt.getTime() <= current.observedAt.getTime())
    .slice()
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime());

  const last = history.at(-1);
  const nowMs = current.observedAt.getTime();
  const windowStartMs = nowMs - config.windowMs;

  const recentIncrease = last ? Math.max(0, current.views - last.views) : current.views;
  const recentMs = last ? Math.max(MIN_INTERVAL_MS, nowMs - last.observedAt.getTime()) : MIN_INTERVAL_MS;
  const recentRatePerHour = (recentIncrease / recentMs) * HOUR_MS;

  // Views gained inside the window, measured from the oldest snapshot inside it
  // (or from zero for a submission without history).
  const windowStart = history.find((s) => s.observedAt.getTime() >= windowStartMs);
  const windowIncrease = windowStart
    ? Math.max(0, current.views - windowStart.views)
    : last
      ? 0
      : current.views;

  const baseMetrics = {
    recentIncrease,
    recentMinutes: Math.round(recentMs / 60_000),
    recentRatePerHour: Math.round(recentRatePerHour),
    windowIncrease,
  };
  const windowMinutes = Math.round(config.windowMs / 60_000);

  if (windowIncrease >= config.absoluteCeiling) {
    return {
      status: "SPIKE",
      flagged: true,
      reason: `Gained ${fmt.format(windowIncrease)} views within ${windowMinutes} minutes, above the ${fmt.format(config.absoluteCeiling)}-view review ceiling.`,
      metrics: { ...baseMetrics, baselineRatePerHour: null },
    };
  }

  const first = history[0];
  const baselineMs = first && last ? last.observedAt.getTime() - first.observedAt.getTime() : 0;
  if (history.length < config.minHistory || !first || !last || baselineMs <= 0) {
    return {
      status: "INSUFFICIENT_HISTORY",
      flagged: false,
      reason: null,
      metrics: { ...baseMetrics, baselineRatePerHour: null },
    };
  }

  const baselineRatePerHour = Math.max(MIN_BASELINE_RATE, ((last.views - first.views) / baselineMs) * HOUR_MS);
  const withinWindow = nowMs - last.observedAt.getTime() <= config.windowMs;
  const isSpike =
    withinWindow &&
    recentIncrease >= config.minIncrease &&
    recentRatePerHour >= config.rateMultiplier * baselineRatePerHour;

  const metrics = { ...baseMetrics, baselineRatePerHour: Math.round(baselineRatePerHour) };
  if (!isSpike) return { status: "NORMAL", flagged: false, reason: null, metrics };

  const multiple = recentRatePerHour / baselineRatePerHour;
  return {
    status: "SPIKE",
    flagged: true,
    reason: `Gained ${fmt.format(recentIncrease)} views in ${Math.max(1, baseMetrics.recentMinutes)} minutes — about ${multiple >= 100 ? fmt.format(Math.round(multiple)) : multiple.toFixed(1)}× this post's usual hourly growth.`,
    metrics,
  };
}

export function spikeConfigFromEnv(cfg: {
  VIEW_SPIKE_WINDOW_MINUTES: number;
  VIEW_SPIKE_MIN_INCREASE: number;
  VIEW_SPIKE_RATE_MULTIPLIER: number;
  VIEW_SPIKE_MIN_HISTORY: number;
  VIEW_SPIKE_ABSOLUTE_CEILING: number;
}): SpikeConfig {
  return {
    windowMs: cfg.VIEW_SPIKE_WINDOW_MINUTES * 60_000,
    minIncrease: cfg.VIEW_SPIKE_MIN_INCREASE,
    rateMultiplier: cfg.VIEW_SPIKE_RATE_MULTIPLIER,
    minHistory: cfg.VIEW_SPIKE_MIN_HISTORY,
    absoluteCeiling: cfg.VIEW_SPIKE_ABSOLUTE_CEILING,
  };
}
