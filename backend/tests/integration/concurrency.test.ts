import type { Express } from "express";
import { Campaign } from "../../src/models/campaign.model";
import { PayoutLedger } from "../../src/models/payout-ledger.model";
import { Submission } from "../../src/models/submission.model";
import { checkCampaignIntegrity } from "../../src/services/payout/payout-engine.service";
import {
  createCampaign,
  patchViewsWithRetry,
  registerUser,
  resetDatabase,
  rs,
  startIntegration,
  stopIntegration,
  submitPost,
  type TestUser,
} from "../helpers/integration";

/**
 * These tests fire genuinely parallel HTTP requests at the payout engine
 * (real MongoDB replica set, real transactions) and then check the money
 * invariants directly in the database.
 */

jest.setTimeout(120_000);

let app: Express;
let brand: TestUser;
let creator: TestUser;

beforeAll(async () => {
  app = await startIntegration("concurrency");
});
afterAll(stopIntegration);
beforeEach(async () => {
  await resetDatabase();
  brand = await registerUser(app, "BRAND");
  creator = await registerUser(app, "CREATOR");
});

async function expectInvariants(campaignId: string) {
  const campaign = (await Campaign.findById(campaignId).lean())!;
  const ledger = await PayoutLedger.find({ campaignId }).lean();
  const subs = await Submission.find({ campaignId }).lean();
  const ledgerTotal = ledger.reduce((s, l) => s + l.amountPaise, 0);

  expect(campaign.allocatedPaise).toBeLessThanOrEqual(campaign.budgetPaise);
  expect(ledgerTotal).toBe(campaign.allocatedPaise);
  expect(subs.reduce((s, x) => s + x.allocatedPaise, 0)).toBe(campaign.allocatedPaise);
  for (const sub of subs) {
    const mine = ledger.filter((l) => String(l.submissionId) === String(sub._id));
    expect(mine.reduce((s, l) => s + l.amountPaise, 0)).toBe(sub.allocatedPaise);
    expect(sub.allocatedPaise).toBeLessThanOrEqual(sub.eligiblePaise);
    // Ledger sequence numbers are gap-free and unique per submission.
    expect(mine.map((l) => l.sequence).sort((a, b) => a - b)).toEqual(mine.map((_, i) => i + 1));
  }
  expect((await checkCampaignIntegrity(campaignId)).consistent).toBe(true);
  return { campaign, ledger, subs };
}

it("two ₹5,000 entitlements racing for ₹6,000 allocate exactly ₹6,000, never ₹10,000", async () => {
  const { id } = await createCampaign(brand, { budgetPaise: rs(6_000) });
  const a = await submitPost(creator, id);
  const b = await submitPost(creator, id);

  const [ra, rb] = await Promise.all([patchViewsWithRetry(app, a, { views: 100_000 }), patchViewsWithRetry(app, b, { views: 100_000 })]);
  expect(ra.status).toBe(200);
  expect(rb.status).toBe(200);

  const { campaign, subs } = await expectInvariants(id);
  expect(campaign.allocatedPaise).toBe(rs(6_000));
  expect(subs.map((s) => s.allocatedPaise).sort((x, y) => x - y)).toEqual([rs(1_000), rs(5_000)]);
  expect(subs.map((s) => s.fundingStatus).sort()).toEqual(["FULLY_FUNDED", "PARTIALLY_FUNDED"]);
});

it("many submissions crossing milestones at once never overspend the budget", async () => {
  const budget = rs(23_500);
  const { id } = await createCampaign(brand, { budgetPaise: budget });
  const second = await registerUser(app, "CREATOR");
  const subs: string[] = [];
  for (let i = 0; i < 12; i += 1) subs.push(await submitPost(i % 2 === 0 ? creator : second, id));

  const responses = await Promise.all(subs.map((s, i) => patchViewsWithRetry(app, s, { views: i % 3 === 0 ? 60_000 : 120_000 })));
  for (const r of responses) expect(r.status).toBe(200);

  const { campaign, subs: docs } = await expectInvariants(id);
  const totalEligible = docs.reduce((s, d) => s + d.eligiblePaise, 0);
  expect(totalEligible).toBe(4 * rs(2_000) + 8 * rs(5_000));
  // Entitlements (₹48,000) exceed the budget, so the budget is fully and exactly used.
  expect(campaign.allocatedPaise).toBe(budget);
  expect(docs.filter((d) => d.fundingStatus === "PARTIALLY_FUNDED").length).toBeLessThanOrEqual(1);
});

it("the same update arriving many times at once allocates exactly once", async () => {
  const { id } = await createCampaign(brand);
  const sub = await submitPost(creator, id);
  const responses = await Promise.all(Array.from({ length: 10 }, () => patchViewsWithRetry(app, sub, { views: 100_000 })));
  for (const r of responses) expect(r.status).toBe(200);
  expect(responses.filter((r) => r.body.data.allocation.grantedPaise > 0)).toHaveLength(1);

  const { ledger, campaign } = await expectInvariants(id);
  expect(ledger).toHaveLength(1);
  expect(campaign.allocatedPaise).toBe(rs(5_000));
});

it("concurrent retries with one Idempotency-Key produce one ledger entry and identical results", async () => {
  const { id } = await createCampaign(brand);
  const sub = await submitPost(creator, id);
  const headers = { "Idempotency-Key": "platform-event-77812" };
  const responses = await Promise.all(Array.from({ length: 8 }, () => patchViewsWithRetry(app, sub, { views: 75_000 }, headers)));
  for (const r of responses) expect(r.status).toBe(200);
  const allocations = responses.map((r) => JSON.stringify(r.body.data.allocation));
  expect(new Set(allocations).size).toBe(1);
  expect(responses.filter((r) => r.headers["idempotent-replayed"] === "true")).toHaveLength(7);

  const { ledger } = await expectInvariants(id);
  expect(ledger).toHaveLength(1);
  expect(ledger[0]!.idempotencyKey).toBe("platform-event-77812");
});

it("out-of-order concurrent snapshots for one post can't lose updates or double-pay", async () => {
  const { id } = await createCampaign(brand);
  const sub = await submitPost(creator, id);
  const views = [12_000, 55_000, 101_000, 30_000, 70_000, 99_000];
  const responses = await Promise.all(views.map((v) => patchViewsWithRetry(app, sub, { views: v })));
  for (const r of responses) expect([200, 409]).toContain(r.status);

  const { subs, ledger } = await expectInvariants(id);
  const doc = subs[0]!;
  const maxAccepted = Math.max(...views.filter((_, i) => responses[i]!.status === 200));
  expect(doc.currentViews).toBe(maxAccepted);
  // Whatever order they landed in, allocation equals the payout for the highest accepted count.
  const expected = maxAccepted >= 100_000 ? rs(5_000) : maxAccepted >= 50_000 ? rs(2_000) : rs(500);
  expect(doc.allocatedPaise).toBe(expected);
  expect(ledger.reduce((s, l) => s + l.amountPaise, 0)).toBe(expected);
});

it("budget top-ups racing with view updates keep every invariant", async () => {
  const { id } = await createCampaign(brand, { budgetPaise: rs(5_000) });
  const subs: string[] = [];
  for (let i = 0; i < 6; i += 1) subs.push(await submitPost(creator, id));

  const topUp = () =>
    brand.agent.post(`/api/campaigns/${id}/budget/top-ups`).set("x-csrf-token", brand.csrf).send({ amountPaise: rs(4_000) });
  const results = await Promise.all([
    ...subs.map((s) => patchViewsWithRetry(app, s, { views: 100_000 })),
    topUp(),
    topUp(),
  ]);
  for (const r of results) expect(r.status).toBe(200);

  const { campaign } = await expectInvariants(id);
  expect(campaign.budgetPaise).toBe(rs(13_000));
  // ₹30,000 of entitlement against a ₹13,000 budget: the whole budget is used, never more.
  expect(campaign.allocatedPaise).toBe(rs(13_000));
});

it("50 simultaneous updates on one hot campaign: all succeed (with safe retries) and the books balance", async () => {
  const creators = await Promise.all(Array.from({ length: 5 }, () => registerUser(app, "CREATOR")));
  const { id } = await createCampaign(brand, { budgetPaise: rs(100_000) });
  const subs: string[] = [];
  for (let i = 0; i < 50; i += 1) subs.push(await submitPost(creators[i % 5]!, id));
  const responses = await Promise.all(subs.map((s) => patchViewsWithRetry(app, s, { views: 120_000 })));
  for (const r of responses) expect(r.status).toBe(200);
  const { campaign, subs: docs } = await expectInvariants(id);
  expect(campaign.allocatedPaise).toBe(rs(100_000));
  expect(docs.filter((d) => d.fundingStatus === "FULLY_FUNDED")).toHaveLength(20);
});
