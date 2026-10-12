import {
  assertValidMilestoneLadder,
  calculatePayout,
  fundingStatusFor,
  getMilestoneLadderIssues,
  InvalidMilestoneLadderError,
  InvalidViewsError,
  maxPayoutPaise,
  planAllocation,
  resolveMilestone,
} from "../../src/services/payout/payout-calculator";
import type { Milestone } from "../../src/types/domain";

// The assignment's example ladder, in paise.
const LADDER: Milestone[] = [
  { views: 10_000, payoutPaise: 500_00 },
  { views: 50_000, payoutPaise: 2_000_00 },
  { views: 100_000, payoutPaise: 5_000_00 },
];

describe("calculatePayout", () => {
  it.each([
    [0, 0],
    [9_999, 0],
    [10_000, 500_00],
    [49_999, 500_00],
    [50_000, 2_000_00],
    [65_000, 2_000_00],
    [100_000, 5_000_00],
  ])("%i views pays %i paise (assignment table)", (views, expected) => {
    expect(calculatePayout(views, LADDER)).toBe(expected);
  });

  it("pays nothing below the first milestone", () => {
    expect(calculatePayout(1, LADDER)).toBe(0);
  });

  it("matches thresholds exactly (>=, not >)", () => {
    for (const m of LADDER) {
      expect(calculatePayout(m.views, LADDER)).toBe(m.payoutPaise);
      expect(calculatePayout(m.views - 1, LADDER)).toBeLessThan(m.payoutPaise);
    }
  });

  it("is not cumulative: 65,000 views earns ₹2,000, not ₹2,500", () => {
    expect(calculatePayout(65_000, LADDER)).toBe(2_000_00);
  });

  it("selects the highest milestone when several are crossed in one update (8k -> 120k)", () => {
    expect(calculatePayout(8_000, LADDER)).toBe(0);
    expect(calculatePayout(120_000, LADDER)).toBe(5_000_00);
    expect(resolveMilestone(120_000, LADDER).reachedIndex).toBe(2);
  });

  it("caps at the top milestone for very large counts", () => {
    expect(calculatePayout(Number.MAX_SAFE_INTEGER, LADDER)).toBe(5_000_00);
  });

  it("works with a single-milestone ladder", () => {
    expect(calculatePayout(5, [{ views: 5, payoutPaise: 1 }])).toBe(1);
  });

  it.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY], [Number.MAX_SAFE_INTEGER + 1], ["100" as unknown as number], [null as unknown as number]])(
    "rejects invalid view count %p",
    (views) => {
      expect(() => calculatePayout(views, LADDER)).toThrow(InvalidViewsError);
    },
  );

  it("rejects invalid ladders instead of guessing", () => {
    expect(() => calculatePayout(10, [])).toThrow(InvalidMilestoneLadderError);
  });
});

describe("resolveMilestone", () => {
  it("reports next milestone and progress", () => {
    const r = resolveMilestone(30_000, LADDER);
    expect(r.reached).toEqual(LADDER[0]);
    expect(r.next).toEqual(LADDER[1]);
    expect(r.progressToNext).toBeCloseTo(0.5);
  });

  it("reports progress from zero before the first milestone", () => {
    const r = resolveMilestone(2_500, LADDER);
    expect(r.reachedIndex).toBe(-1);
    expect(r.progressToNext).toBeCloseTo(0.25);
  });

  it("reports a complete ladder", () => {
    const r = resolveMilestone(150_000, LADDER);
    expect(r.next).toBeNull();
    expect(r.progressToNext).toBe(1);
  });
});

describe("milestone ladder validation", () => {
  it("accepts the assignment ladder", () => {
    expect(getMilestoneLadderIssues(LADDER)).toEqual([]);
    expect(() => assertValidMilestoneLadder(LADDER)).not.toThrow();
  });

  it("accepts equal payouts on consecutive milestones (non-decreasing)", () => {
    expect(getMilestoneLadderIssues([{ views: 1, payoutPaise: 100 }, { views: 2, payoutPaise: 100 }])).toEqual([]);
  });

  it.each<[string, Milestone[]]>([
    ["empty", []],
    ["zero threshold", [{ views: 0, payoutPaise: 100 }]],
    ["negative threshold", [{ views: -5, payoutPaise: 100 }]],
    ["fractional threshold", [{ views: 10.5, payoutPaise: 100 }]],
    ["duplicate thresholds", [{ views: 10, payoutPaise: 100 }, { views: 10, payoutPaise: 200 }]],
    ["decreasing thresholds", [{ views: 50, payoutPaise: 100 }, { views: 10, payoutPaise: 200 }]],
    ["decreasing payouts", [{ views: 10, payoutPaise: 500 }, { views: 50, payoutPaise: 200 }]],
    ["zero payout", [{ views: 10, payoutPaise: 0 }]],
    ["fractional paise", [{ views: 10, payoutPaise: 10.5 }]],
  ])("rejects %s", (_label, ladder) => {
    expect(getMilestoneLadderIssues(ladder).length).toBeGreaterThan(0);
    expect(() => assertValidMilestoneLadder(ladder)).toThrow(InvalidMilestoneLadderError);
  });

  it("rejects more than 20 milestones", () => {
    const ladder = Array.from({ length: 21 }, (_, i) => ({ views: (i + 1) * 10, payoutPaise: (i + 1) * 100 }));
    expect(getMilestoneLadderIssues(ladder)).toContain("no more than 20 milestones are allowed");
  });

  it("computes the max payout", () => {
    expect(maxPayoutPaise(LADDER)).toBe(5_000_00);
  });
});

describe("planAllocation (budget cap + partial-budget policy)", () => {
  const base = { campaignBudgetPaise: 10_000_00, campaignAllocatedPaise: 0 };

  it("grants the full delta when budget is available", () => {
    const p = planAllocation({ ...base, eligiblePaise: 2_000_00, allocatedPaise: 500_00 });
    expect(p.requiredPaise).toBe(1_500_00);
    expect(p.grantPaise).toBe(1_500_00);
    expect(p.newAllocatedPaise).toBe(2_000_00);
    expect(p.fundingStatus).toBe("FULLY_FUNDED");
    expect(p.remainingAfterPaise).toBe(8_500_00);
  });

  it("grants only what remains when the budget is short (partial)", () => {
    const p = planAllocation({ eligiblePaise: 5_000_00, allocatedPaise: 0, campaignBudgetPaise: 6_000_00, campaignAllocatedPaise: 5_000_00 });
    expect(p.grantPaise).toBe(1_000_00);
    expect(p.newAllocatedPaise).toBe(1_000_00);
    expect(p.fundingStatus).toBe("PARTIALLY_FUNDED");
    expect(p.remainingAfterPaise).toBe(0);
  });

  it("grants nothing when the budget is exhausted", () => {
    const p = planAllocation({ eligiblePaise: 5_000_00, allocatedPaise: 0, campaignBudgetPaise: 6_000_00, campaignAllocatedPaise: 6_000_00 });
    expect(p.grantPaise).toBe(0);
    expect(p.fundingStatus).toBe("UNFUNDED");
  });

  it("grants nothing on a repeated update (already allocated)", () => {
    const p = planAllocation({ ...base, eligiblePaise: 2_000_00, allocatedPaise: 2_000_00 });
    expect(p.requiredPaise).toBe(0);
    expect(p.grantPaise).toBe(0);
    expect(p.fundingStatus).toBe("FULLY_FUNDED");
  });

  it("never grants a negative amount even if allocation somehow exceeds eligibility", () => {
    const p = planAllocation({ ...base, eligiblePaise: 500_00, allocatedPaise: 2_000_00 });
    expect(p.grantPaise).toBe(0);
  });

  it("treats an over-allocated campaign as having zero remaining", () => {
    const p = planAllocation({ eligiblePaise: 500_00, allocatedPaise: 0, campaignBudgetPaise: 100, campaignAllocatedPaise: 200 });
    expect(p.remainingBeforePaise).toBe(0);
    expect(p.grantPaise).toBe(0);
  });

  it("rejects non-integer money", () => {
    expect(() => planAllocation({ ...base, eligiblePaise: 1.5, allocatedPaise: 0 })).toThrow(RangeError);
    expect(() => planAllocation({ ...base, eligiblePaise: -1, allocatedPaise: 0 })).toThrow(RangeError);
  });

  it("holds its invariants across many random inputs", () => {
    let seed = 42;
    const rand = (max: number) => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
      return seed % (max + 1);
    };
    for (let i = 0; i < 5_000; i += 1) {
      const budget = rand(1_000_000);
      const campaignAllocated = rand(budget);
      const eligible = rand(500_000);
      const allocated = rand(eligible);
      const p = planAllocation({ eligiblePaise: eligible, allocatedPaise: allocated, campaignBudgetPaise: budget, campaignAllocatedPaise: campaignAllocated });
      expect(p.grantPaise).toBeGreaterThanOrEqual(0);
      expect(campaignAllocated + p.grantPaise).toBeLessThanOrEqual(budget);
      expect(p.newAllocatedPaise).toBeLessThanOrEqual(eligible);
      expect(Number.isInteger(p.grantPaise)).toBe(true);
    }
  });
});

describe("fundingStatusFor", () => {
  it.each([
    [0, 0, "NOT_ELIGIBLE"],
    [100, 100, "FULLY_FUNDED"],
    [100, 40, "PARTIALLY_FUNDED"],
    [100, 0, "UNFUNDED"],
  ])("eligible %i / allocated %i -> %s", (eligible, allocated, status) => {
    expect(fundingStatusFor(eligible, allocated)).toBe(status);
  });
});
