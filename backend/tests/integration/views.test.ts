import type { Express } from "express";
import request from "supertest";
import { createRedisClient, getRedis, setRedisClient } from "../../src/config/redis";
import { AuditEvent } from "../../src/models/audit-event.model";
import { Campaign } from "../../src/models/campaign.model";
import { PayoutLedger } from "../../src/models/payout-ledger.model";
import { Submission } from "../../src/models/submission.model";
import { checkCampaignIntegrity } from "../../src/services/payout/payout-engine.service";
import {
  createCampaign,
  patchViews,
  registerUser,
  resetDatabase,
  rs,
  startIntegration,
  stopIntegration,
  submitPost,
  type TestUser,
} from "../helpers/integration";

let app: Express;
let brand: TestUser;
let creator: TestUser;

beforeAll(async () => {
  app = await startIntegration("views");
});
afterAll(stopIntegration);
beforeEach(async () => {
  await resetDatabase();
  brand = await registerUser(app, "BRAND");
  creator = await registerUser(app, "CREATOR", "Viral Vikram");
});

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe("PATCH /api/submissions/:id/views — access control and validation", () => {
  it("is not an open endpoint: requires the service key in internal mode", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    const res = await request(app).patch(`/api/submissions/${sub}/views`).send({ views: 10_000 }).expect(401);
    expect(res.body.error.code).toBe("SERVICE_KEY_REQUIRED");
    await request(app).patch(`/api/submissions/${sub}/views`).set("x-service-key", "wrong-key").send({ views: 10_000 }).expect(401);
    // A logged-in user's cookies don't grant access either.
    await creator.agent.patch(`/api/submissions/${sub}/views`).send({ views: 10_000 }).expect(401);
    expect((await Submission.findById(sub).lean())!.currentViews).toBe(0);
  });

  it.each([[{ views: -1 }], [{ views: 10.5 }], [{ views: "1000" }], [{ views: null }], [{}], [{ views: 2 ** 60 }], [{ views: 5, extra: true }], [{ views: 5, observedAt: "yesterday" }]])(
    "rejects malformed body %p",
    async (body) => {
      const { id } = await createCampaign(brand);
      const sub = await submitPost(creator, id);
      await patchViews(app, sub, body).expect(422);
    },
  );

  it("returns 404 for unknown submissions", async () => {
    await patchViews(app, "64b000000000000000000000", { views: 1 }).expect(404);
  });

  it("writes an audit event for each accepted update", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 12_000 }).expect(200);
    const events = await AuditEvent.find({ action: "VIEWS_UPDATED", targetId: sub }).lean();
    expect(events).toHaveLength(1);
    expect(events[0]!.actorType).toBe("SERVICE");
    expect(events[0]!.metadata).toMatchObject({ fromViews: 0, toViews: 12_000, grantedPaise: rs(500) });
  });
});

describe("milestone payouts", () => {
  it("allocates the highest milestone reached, as deltas, with a ledger entry per change", async () => {
    const { id } = await createCampaign(brand, { budgetPaise: rs(20_000) });
    const sub = await submitPost(creator, id);

    const steps: [number, number, number][] = [
      // views, expected eligible, expected granted delta
      [9_999, 0, 0],
      [10_000, rs(500), rs(500)],
      [49_999, rs(500), 0],
      [65_000, rs(2_000), rs(1_500)],
      [100_000, rs(5_000), rs(3_000)],
      [250_000, rs(5_000), 0],
    ];
    for (const [views, eligible, granted] of steps) {
      const res = await patchViews(app, sub, { views }).expect(200);
      expect(res.body.data.submission.eligiblePaise).toBe(eligible);
      expect(res.body.data.submission.allocatedPaise).toBe(eligible);
      expect(res.body.data.allocation.grantedPaise).toBe(granted);
    }

    const ledger = await PayoutLedger.find({ submissionId: sub }).sort({ sequence: 1 }).lean();
    expect(ledger.map((l) => l.amountPaise)).toEqual([rs(500), rs(1_500), rs(3_000)]);
    expect(ledger.map((l) => l.sequence)).toEqual([1, 2, 3]);
    expect(ledger.reduce((s, l) => s + l.amountPaise, 0)).toBe(rs(5_000));

    const campaign = await Campaign.findById(id).lean();
    expect(campaign!.allocatedPaise).toBe(rs(5_000));
    expect((await checkCampaignIntegrity(id)).consistent).toBe(true);
  });

  it("jumps straight to the top milestone when several are crossed at once (8k -> 120k)", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 8_000 }).expect(200);
    const res = await patchViews(app, sub, { views: 120_000 }).expect(200);
    expect(res.body.data.allocation.grantedPaise).toBe(rs(5_000));
    expect(res.body.data.submission.highestMilestone).toEqual({ index: 2, views: 100_000, payoutPaise: rs(5_000) });
    expect(await PayoutLedger.countDocuments({ submissionId: sub })).toBe(1);
  });

  it("returns the campaign budget summary with each update", async () => {
    const { id } = await createCampaign(brand, { budgetPaise: rs(10_000) });
    const sub = await submitPost(creator, id);
    const res = await patchViews(app, sub, { views: 50_000 }).expect(200);
    expect(res.body.data.campaign).toMatchObject({
      id,
      budgetPaise: rs(10_000),
      allocatedPaise: rs(2_000),
      remainingPaise: rs(8_000),
      utilizationPct: 20,
    });
  });

  it("treats an identical repeat as a no-op (no second allocation)", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 60_000 }).expect(200);
    const again = await patchViews(app, sub, { views: 60_000 }).expect(200);
    expect(again.body.data.outcome).toBe("UNCHANGED");
    expect(again.body.data.allocation.grantedPaise).toBe(0);
    expect(await PayoutLedger.countDocuments({ submissionId: sub })).toBe(1);
  });
});

describe("stale and decreasing snapshots", () => {
  it("never lets views (or earnings) go backwards", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 60_000 }).expect(200);
    const res = await patchViews(app, sub, { views: 40_000 }).expect(409);
    expect(res.body.error.code).toBe("VIEWS_CANNOT_DECREASE");
    const doc = await Submission.findById(sub).lean();
    expect(doc!.currentViews).toBe(60_000);
    expect(doc!.allocatedPaise).toBe(rs(2_000));
  });

  it("ignores snapshots observed before the latest accepted one", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 20_000, observedAt: minutesAgo(5) }).expect(200);
    const res = await patchViews(app, sub, { views: 90_000, observedAt: minutesAgo(30) }).expect(409);
    expect(res.body.error.code).toBe("STALE_SNAPSHOT");
    expect((await Submission.findById(sub).lean())!.currentViews).toBe(20_000);
  });

  it("rejects snapshots from the future", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 1, observedAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(422);
  });
});

describe("budget cap and partial-budget policy", () => {
  it("partially funds when the budget runs short, then leaves later submissions unfunded", async () => {
    // Budget ₹6,000; ladder max ₹5,000.
    const { id } = await createCampaign(brand, { budgetPaise: rs(6_000) });
    const a = await submitPost(creator, id);
    const b = await submitPost(creator, id);
    const c = await submitPost(creator, id);

    const ra = await patchViews(app, a, { views: 100_000 }).expect(200);
    expect(ra.body.data.allocation).toMatchObject({ grantedPaise: rs(5_000), partial: false });

    const rb = await patchViews(app, b, { views: 100_000 }).expect(200);
    expect(rb.body.data.allocation).toMatchObject({ requiredPaise: rs(5_000), grantedPaise: rs(1_000), partial: true });
    expect(rb.body.data.submission).toMatchObject({ eligiblePaise: rs(5_000), allocatedPaise: rs(1_000), fundingStatus: "PARTIALLY_FUNDED", shortfallPaise: rs(4_000) });
    expect(rb.body.data.campaign.remainingPaise).toBe(0);

    const rc = await patchViews(app, c, { views: 10_000 }).expect(200);
    expect(rc.body.data.submission).toMatchObject({ eligiblePaise: rs(500), allocatedPaise: 0, fundingStatus: "UNFUNDED" });

    const campaign = await Campaign.findById(id).lean();
    expect(campaign!.allocatedPaise).toBe(rs(6_000));
    expect(campaign!.budgetExhaustedAt).not.toBeNull();
    const ledger = await PayoutLedger.find({ campaignId: id }).lean();
    expect(ledger.reduce((s, l) => s + l.amountPaise, 0)).toBe(rs(6_000));
    expect(ledger.find((l) => String(l.submissionId) === b)!.partial).toBe(true);
    expect((await checkCampaignIntegrity(id)).consistent).toBe(true);
  });

  it("closes submissions once the budget is fully allocated", async () => {
    const { id } = await createCampaign(brand, { budgetPaise: rs(5_000) });
    const a = await submitPost(creator, id);
    await patchViews(app, a, { views: 100_000 }).expect(200);
    const res = await creator.agent.post(`/api/campaigns/${id}/submissions`).set("x-csrf-token", creator.csrf).send({ postUrl: "https://www.instagram.com/p/CxLateOne/" }).expect(409);
    expect(res.body.error.code).toBe("SUBMISSIONS_CLOSED");
  });

  it("back-fills under-funded submissions oldest-first when the brand tops up", async () => {
    const { id } = await createCampaign(brand, { budgetPaise: rs(6_000) });
    const a = await submitPost(creator, id);
    const b = await submitPost(creator, id);
    const c = await submitPost(creator, id);
    await patchViews(app, a, { views: 100_000 }).expect(200); // ₹5,000 funded
    await patchViews(app, b, { views: 100_000 }).expect(200); // ₹1,000 of ₹5,000 (queued first)
    await patchViews(app, c, { views: 50_000 }).expect(200); // ₹0 of ₹2,000 (queued second)

    // ₹5,000 top-up: B needs ₹4,000 (older), C gets the remaining ₹1,000.
    const res = await brand.agent.post(`/api/campaigns/${id}/budget/top-ups`).set("x-csrf-token", brand.csrf).send({ amountPaise: rs(5_000) }).expect(200);
    expect(res.body.data.reconciliation).toMatchObject({ allocatedPaise: rs(5_000), submissionsFunded: 2, remainingPaise: 0 });

    const [sb, sc] = await Promise.all([Submission.findById(b).lean(), Submission.findById(c).lean()]);
    expect(sb).toMatchObject({ allocatedPaise: rs(5_000), fundingStatus: "FULLY_FUNDED", underfundedSince: null });
    expect(sc).toMatchObject({ allocatedPaise: rs(1_000), fundingStatus: "PARTIALLY_FUNDED" });

    const recon = await PayoutLedger.find({ campaignId: id, type: "RECONCILIATION" }).lean();
    expect(recon.map((l) => l.amountPaise).sort((x, y) => x - y)).toEqual([rs(1_000), rs(4_000)]);
    expect((await Campaign.findById(id).lean())!.allocatedPaise).toBe(rs(11_000));
    expect((await checkCampaignIntegrity(id)).consistent).toBe(true);

    // Reconciling again changes nothing (idempotent).
    const again = await brand.agent.post(`/api/campaigns/${id}/reconcile`).set("x-csrf-token", brand.csrf).expect(200);
    expect(again.body.data.reconciliation.allocatedPaise).toBe(0);
  });
});

describe("idempotency keys", () => {
  it("replays the original result for a retried request", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    const key = "ingest-2026-10-12-abc";
    const first = await patchViews(app, sub, { views: 55_000 }, { "Idempotency-Key": key }).expect(200);
    // Meanwhile views move on...
    await patchViews(app, sub, { views: 70_000 }).expect(200);
    // ...and a network retry of the first request replays, it does not re-apply.
    const retry = await patchViews(app, sub, { views: 55_000 }, { "Idempotency-Key": key }).expect(200);
    expect(retry.headers["idempotent-replayed"]).toBe("true");
    expect(retry.body.data.allocation).toEqual(first.body.data.allocation);
    expect((await Submission.findById(sub).lean())!.currentViews).toBe(70_000);
    expect(await PayoutLedger.countDocuments({ submissionId: sub })).toBe(1);
  });

  it("rejects reusing a key for a different request", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 10_000 }, { "Idempotency-Key": "same-key-123" }).expect(200);
    const res = await patchViews(app, sub, { views: 20_000 }, { "Idempotency-Key": "same-key-123" }).expect(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("validates the key format", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 1 }, { "Idempotency-Key": "bad key!" }).expect(422);
  });
});

describe("campaign state and submission state", () => {
  it("keeps tracking views while paused but refuses completed campaigns", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await brand.agent.patch(`/api/campaigns/${id}`).set("x-csrf-token", brand.csrf).send({ status: "PAUSED" }).expect(200);
    await patchViews(app, sub, { views: 10_000 }).expect(200);
    await brand.agent.patch(`/api/campaigns/${id}`).set("x-csrf-token", brand.csrf).send({ status: "COMPLETED" }).expect(200);
    const res = await patchViews(app, sub, { views: 20_000 }).expect(409);
    expect(res.body.error.code).toBe("CAMPAIGN_NOT_TRACKING");
  });

  it("refuses to reject a submission that already earned money", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 10_000 }).expect(200);
    const res = await brand.agent.post(`/api/submissions/${sub}/reject`).set("x-csrf-token", brand.csrf).send({ reason: "Changed my mind" }).expect(409);
    expect(res.body.error.code).toBe("HAS_ALLOCATIONS");
  });
});

describe("anomaly detection", () => {
  it("flags a sudden spike, keeps the submission and its payout, and shows it to the brand", async () => {
    const { id } = await createCampaign(brand, { budgetPaise: rs(50_000) });
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 1_000, observedAt: minutesAgo(180) }).expect(200);
    await patchViews(app, sub, { views: 2_000, observedAt: minutesAgo(120) }).expect(200);
    const normal = await patchViews(app, sub, { views: 3_100, observedAt: minutesAgo(60) }).expect(200);
    expect(normal.body.data.anomaly.flagged).toBe(false);

    const spike = await patchViews(app, sub, { views: 150_000, observedAt: minutesAgo(50) }).expect(200);
    expect(spike.body.data.anomaly).toMatchObject({ flagged: true, newlyFlagged: true });
    expect(spike.body.data.anomaly.reason).toMatch(/views in 10 minutes/);
    // Heuristic flags never block earned payouts.
    expect(spike.body.data.allocation.grantedPaise).toBe(rs(5_000));

    const list = await brand.agent.get(`/api/campaigns/${id}/submissions?flagged=true`).expect(200);
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].anomaly).toMatchObject({ flagged: true, reviewedAt: null });

    await brand.agent.post(`/api/submissions/${sub}/anomaly/acknowledge`).set("x-csrf-token", brand.csrf).expect(200);
    const after = await brand.agent.get(`/api/submissions/${sub}`).expect(200);
    expect(after.body.data.submission.anomaly.flagged).toBe(true);
    expect(after.body.data.submission.anomaly.reviewedAt).not.toBeNull();
    expect(after.body.data.submission.currentViews).toBe(150_000);

    const analytics = await brand.agent.get(`/api/campaigns/${id}/analytics`).expect(200);
    expect(analytics.body.data.totals).toMatchObject({ flaggedSubmissions: 1, unreviewedFlags: 0 });
    expect(await AuditEvent.countDocuments({ action: "VIEW_SPIKE_FLAGGED" })).toBe(1);
  });
});

describe("earnings and ledger endpoints", () => {
  it("derives creator earnings from backend data", async () => {
    const one = await createCampaign(brand, { name: "Alpha", budgetPaise: rs(6_000) });
    const two = await createCampaign(brand, { name: "Beta" });
    const s1 = await submitPost(creator, one.id);
    const s2 = await submitPost(creator, one.id);
    const s3 = await submitPost(creator, two.id);
    await patchViews(app, s1, { views: 100_000 }).expect(200); // 5000
    await patchViews(app, s2, { views: 100_000 }).expect(200); // 1000 of 5000
    await patchViews(app, s3, { views: 60_000 }).expect(200); // 2000

    const summary = await creator.agent.get("/api/earnings/summary").expect(200);
    expect(summary.body.data.totals).toEqual({
      submissions: 3,
      activeSubmissions: 3,
      views: 260_000,
      eligiblePaise: rs(12_000),
      allocatedPaise: rs(8_000),
      paidPaise: 0,
      awaitingBudgetPaise: rs(4_000),
      underfundedSubmissions: 1,
    });
    expect(summary.body.data.byCampaign.map((c: { name: string; allocatedPaise: number }) => [c.name, c.allocatedPaise])).toEqual([
      ["Alpha", rs(6_000)],
      ["Beta", rs(2_000)],
    ]);
    expect(summary.body.data.recentActivity).toHaveLength(3);

    const history = await creator.agent.get("/api/earnings/history").expect(200);
    expect(history.body.data.items).toHaveLength(3);
    expect(history.body.data.daily.reduce((s: number, d: { amountPaise: number }) => s + d.amountPaise, 0)).toBe(rs(8_000));

    await brand.agent.get("/api/earnings/summary").expect(403);

    const other = await registerUser(app, "CREATOR");
    const otherSummary = await other.agent.get("/api/earnings/summary").expect(200);
    expect(otherSummary.body.data.totals.allocatedPaise).toBe(0);
  });

  it("gives the brand an auditable ledger", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 10_000 }).expect(200);
    await patchViews(app, sub, { views: 50_000 }).expect(200);
    const res = await brand.agent.get(`/api/campaigns/${id}/payout-ledger`).expect(200);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items[0]).toMatchObject({ amountPaise: rs(1_500), creatorName: "Viral Vikram", allocatedPaiseAfter: rs(2_000) });
    await creator.agent.get(`/api/campaigns/${id}/payout-ledger`).expect(403);
  });

  it("refuses to modify ledger entries through the application layer", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await patchViews(app, sub, { views: 10_000 }).expect(200);
    await expect(PayoutLedger.updateOne({ submissionId: sub }, { $set: { amountPaise: 1 } })).rejects.toThrow(/append-only/);
    await expect(PayoutLedger.deleteMany({})).rejects.toThrow(/append-only/);
  });
});

describe("Redis outage", () => {
  it("keeps discovery and payouts working (MongoDB alone guarantees correctness)", async () => {
    const original = getRedis();
    const dead = createRedisClient("redis://127.0.0.1:1"); // nothing listens here
    setRedisClient(dead);
    try {
      const { id } = await createCampaign(brand, { budgetPaise: rs(6_000) });
      const list = await creator.agent.get("/api/campaigns").expect(200);
      expect(list.headers["x-cache"]).toBe("BYPASS");
      const a = await submitPost(creator, id);
      const b = await submitPost(creator, id);
      await Promise.all([patchViews(app, a, { views: 100_000 }).expect(200), patchViews(app, b, { views: 100_000 }).expect(200)]);
      expect((await Campaign.findById(id).lean())!.allocatedPaise).toBe(rs(6_000));
      const ready = await request(app).get("/api/health/ready").expect(200);
      expect(ready.body.data.checks.redis).toBe("down");
      expect(ready.body.data.status).toBe("degraded");
    } finally {
      dead.disconnect();
      setRedisClient(original);
    }
  });
});
