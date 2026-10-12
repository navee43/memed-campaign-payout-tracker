import { detectViewSpike, type SpikeConfig, type ViewSnapshot } from "../../src/services/anomaly/view-spike-detector";

const config: SpikeConfig = {
  windowMs: 60 * 60_000,
  minIncrease: 50_000,
  rateMultiplier: 8,
  minHistory: 3,
  absoluteCeiling: 1_000_000,
};

const T0 = new Date("2026-10-01T00:00:00Z").getTime();
const at = (minutes: number, views: number): ViewSnapshot => ({ views, observedAt: new Date(T0 + minutes * 60_000) });

// Steady organic growth: ~1,000 views/hour.
const steady = [at(0, 0), at(60, 1_000), at(120, 2_100), at(180, 3_050)];

describe("detectViewSpike", () => {
  it("does not flag normal growth", () => {
    const r = detectViewSpike(steady, at(240, 4_200), config);
    expect(r.status).toBe("NORMAL");
    expect(r.flagged).toBe(false);
  });

  it("does not flag fast-but-consistent growth (viral posts that were already viral)", () => {
    const viral = [at(0, 0), at(60, 200_000), at(120, 410_000), at(180, 600_000)];
    const r = detectViewSpike(viral, at(240, 800_000), config);
    expect(r.flagged).toBe(false);
  });

  it("flags an unusually large jump within a short window", () => {
    const r = detectViewSpike(steady, at(190, 203_050), config);
    expect(r.status).toBe("SPIKE");
    expect(r.flagged).toBe(true);
    expect(r.reason).toMatch(/2,00,000 views in 10 minutes/);
    expect(r.metrics.baselineRatePerHour).toBeGreaterThan(0);
  });

  it("does not flag a large jump that is below the minimum absolute increase", () => {
    const tiny = [at(0, 0), at(60, 10), at(120, 20), at(180, 30)];
    const r = detectViewSpike(tiny, at(185, 30_000), config); // huge ratio but only 30k views
    expect(r.flagged).toBe(false);
  });

  it("does not flag a jump spread over more than the window", () => {
    const r = detectViewSpike(steady, at(180 + 24 * 60, 120_000), config);
    expect(r.flagged).toBe(false);
  });

  it("reports insufficient history instead of guessing", () => {
    const r = detectViewSpike([at(0, 0)], at(5, 60_000), config);
    expect(r.status).toBe("INSUFFICIENT_HISTORY");
    expect(r.flagged).toBe(false);
    expect(r.metrics.baselineRatePerHour).toBeNull();
  });

  it("handles a submission with no history at all", () => {
    const r = detectViewSpike([], at(5, 100), config);
    expect(r.status).toBe("INSUFFICIENT_HISTORY");
  });

  it("still flags extreme jumps without history via the absolute ceiling", () => {
    const r = detectViewSpike([at(0, 0)], at(10, 2_000_000), config);
    expect(r.status).toBe("SPIKE");
    expect(r.reason).toMatch(/review ceiling/);
  });

  it("uses a baseline floor so a flat history cannot divide by zero", () => {
    const flat = [at(0, 500), at(60, 500), at(120, 500)];
    const r = detectViewSpike(flat, at(130, 60_500), config);
    expect(r.flagged).toBe(true);
    expect(Number.isFinite(r.metrics.recentRatePerHour)).toBe(true);
  });

  it("respects configuration (higher multiplier = fewer flags)", () => {
    const lenient = { ...config, rateMultiplier: 1_000_000 };
    expect(detectViewSpike(steady, at(190, 203_050), lenient).flagged).toBe(false);
  });

  it("ignores snapshots observed after the current one", () => {
    const withFuture = [...steady, at(500, 9_999_999)];
    expect(detectViewSpike(withFuture, at(240, 4_200), config).flagged).toBe(false);
  });
});
