import type { Express } from "express";
import request from "supertest";
import { Campaign } from "../../src/models/campaign.model";
import { createCampaign, DEFAULT_LADDER, registerUser, resetDatabase, rs, startIntegration, stopIntegration, type TestUser } from "../helpers/integration";

let app: Express;
let brand: TestUser;
let otherBrand: TestUser;
let creator: TestUser;

beforeAll(async () => {
  app = await startIntegration("campaigns");
});
afterAll(stopIntegration);
beforeEach(async () => {
  await resetDatabase();
  brand = await registerUser(app, "BRAND", "Brand One");
  otherBrand = await registerUser(app, "BRAND", "Brand Two");
  creator = await registerUser(app, "CREATOR");
});

describe("campaign creation", () => {
  it("lets a brand create a campaign and stores money as integer paise", async () => {
    const res = await brand.agent
      .post("/api/campaigns")
      .set("x-csrf-token", brand.csrf)
      .send({ name: "Monsoon Memes", platform: "INSTAGRAM", budgetPaise: rs(25_000), milestones: DEFAULT_LADDER, status: "LIVE" })
      .expect(201);
    const c = res.body.data.campaign;
    expect(c.budget).toEqual({ budgetPaise: 2_500_000, allocatedPaise: 0, paidPaise: 0, remainingPaise: 2_500_000, utilizationPct: 0 });
    expect(c.maxPayoutPaise).toBe(rs(5_000));
    expect(c.acceptingSubmissions).toBe(true);
    const doc = await Campaign.findById(c.id).lean();
    expect(Number.isInteger(doc!.budgetPaise)).toBe(true);
    expect(String(doc!.ownerId)).toBe(brand.id);
  });

  it("forbids creators from creating campaigns", async () => {
    const res = await creator.agent
      .post("/api/campaigns")
      .set("x-csrf-token", creator.csrf)
      .send({ name: "Nope", platform: "INSTAGRAM", budgetPaise: rs(1000), milestones: DEFAULT_LADDER })
      .expect(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("rejects unauthenticated requests", async () => {
    await request(app).get("/api/campaigns").expect(401);
  });

  it.each([
    ["non-increasing thresholds", { milestones: [{ views: 100, payoutPaise: 100 }, { views: 100, payoutPaise: 200 }] }],
    ["decreasing payouts", { milestones: [{ views: 100, payoutPaise: 500 }, { views: 200, payoutPaise: 100 }] }],
    ["fractional paise", { budgetPaise: 1000.5 }],
    ["budget below max payout", { budgetPaise: rs(4_000) }],
    ["unknown platform", { platform: "TIKTOK" }],
    ["end before start", { startsAt: "2027-01-10T00:00:00Z", endsAt: "2027-01-01T00:00:00Z" }],
    ["http cover image", { coverImageUrl: "http://insecure.example/x.png" }],
    ["mass assignment of money fields", { allocatedPaise: 999 }],
    ["mass assignment of owner", { ownerId: "64b000000000000000000000" }],
  ])("rejects %s", async (_label, overrides) => {
    const res = await brand.agent
      .post("/api/campaigns")
      .set("x-csrf-token", brand.csrf)
      .send({ name: "Bad", platform: "INSTAGRAM", budgetPaise: rs(20_000), milestones: DEFAULT_LADDER, ...overrides })
      .expect(422);
    expect(res.body.success).toBe(false);
    expect(await Campaign.countDocuments()).toBe(0);
  });
});

describe("ownership isolation", () => {
  it("hides one brand's campaigns from another brand", async () => {
    const { id } = await createCampaign(brand);
    await otherBrand.agent.get(`/api/campaigns/${id}`).expect(404);
    await otherBrand.agent.get(`/api/campaigns/${id}/analytics`).expect(404);
    await otherBrand.agent.get(`/api/campaigns/${id}/submissions`).expect(404);
    await otherBrand.agent.get(`/api/campaigns/${id}/payout-ledger`).expect(404);
    const list = await otherBrand.agent.get("/api/campaigns").expect(200);
    expect(list.body.data.items).toHaveLength(0);
  });

  it("prevents another brand from editing or topping up the budget", async () => {
    const { id } = await createCampaign(brand);
    await otherBrand.agent.patch(`/api/campaigns/${id}`).set("x-csrf-token", otherBrand.csrf).send({ name: "Hijacked" }).expect(404);
    await otherBrand.agent.post(`/api/campaigns/${id}/budget/top-ups`).set("x-csrf-token", otherBrand.csrf).send({ amountPaise: rs(1) }).expect(404);
    const doc = await Campaign.findById(id).lean();
    expect(doc!.name).not.toBe("Hijacked");
    expect(doc!.budgetPaise).toBe(rs(20_000));
  });

  it("returns 404 (not 500) for malformed ids", async () => {
    await brand.agent.get("/api/campaigns/not-an-id").expect(422);
    await brand.agent.get("/api/campaigns/64b000000000000000000000").expect(404);
  });
});

describe("creator discovery", () => {
  it("lists only live campaigns, with filters and search", async () => {
    await createCampaign(brand, { name: "Chai Memes", platform: "INSTAGRAM" });
    await createCampaign(brand, { name: "Sneaker Shorts", platform: "YOUTUBE" });
    await createCampaign(brand, { name: "Secret Draft", status: "DRAFT" });

    const all = await creator.agent.get("/api/campaigns").expect(200);
    expect(all.body.data.items.map((c: { name: string }) => c.name).sort()).toEqual(["Chai Memes", "Sneaker Shorts"]);
    expect(all.body.meta).toMatchObject({ page: 1, total: 2 });

    const yt = await creator.agent.get("/api/campaigns?platform=YOUTUBE").expect(200);
    expect(yt.body.data.items.map((c: { name: string }) => c.name)).toEqual(["Sneaker Shorts"]);

    const search = await creator.agent.get("/api/campaigns?search=chai").expect(200);
    expect(search.body.data.items).toHaveLength(1);

    const regexy = await creator.agent.get("/api/campaigns?search=.*").expect(200);
    expect(regexy.body.data.items).toHaveLength(0); // matched literally, not as a regex

    const rich = await creator.agent.get(`/api/campaigns?minPayoutPaise=${rs(6_000)}`).expect(200);
    expect(rich.body.data.items).toHaveLength(0);
  });

  it("hides drafts from creators even by id", async () => {
    const { id } = await createCampaign(brand, { status: "DRAFT" });
    await creator.agent.get(`/api/campaigns/${id}`).expect(404);
  });

  it("paginates", async () => {
    for (let i = 0; i < 5; i += 1) await createCampaign(brand);
    const page = await creator.agent.get("/api/campaigns?page=2&pageSize=2").expect(200);
    expect(page.body.data.items).toHaveLength(2);
    expect(page.body.meta).toEqual({ page: 2, pageSize: 2, total: 5, totalPages: 3 });
  });

  const withRedis = process.env.REDIS_URL ? it : it.skip;
  withRedis("serves discovery from Redis and invalidates on campaign changes", async () => {
    const { id } = await createCampaign(brand, { name: "Cached One" });
    const first = await creator.agent.get("/api/campaigns").expect(200);
    expect(first.headers["x-cache"]).toBe("MISS");
    const second = await creator.agent.get("/api/campaigns").expect(200);
    expect(second.headers["x-cache"]).toBe("HIT");
    expect(second.body.data.items).toEqual(first.body.data.items);

    await brand.agent.patch(`/api/campaigns/${id}`).set("x-csrf-token", brand.csrf).send({ status: "PAUSED" }).expect(200);
    const third = await creator.agent.get("/api/campaigns").expect(200);
    expect(third.headers["x-cache"]).toBe("MISS");
    expect(third.body.data.items).toHaveLength(0);
  });
});

describe("campaign management", () => {
  it("follows the status machine", async () => {
    const { id } = await createCampaign(brand, { status: "DRAFT" });
    const patch = (body: object) => brand.agent.patch(`/api/campaigns/${id}`).set("x-csrf-token", brand.csrf).send(body);
    await patch({ status: "PAUSED" }).expect(409);
    const live = await patch({ status: "LIVE" }).expect(200);
    expect(live.body.data.campaign.publishedAt).not.toBeNull();
    await patch({ status: "PAUSED" }).expect(200);
    await patch({ status: "LIVE" }).expect(200);
    await patch({ status: "COMPLETED" }).expect(200);
    const res = await patch({ status: "LIVE" }).expect(409);
    expect(res.body.error.code).toBe("CAMPAIGN_COMPLETED");
  });

  it("lets drafts edit everything but freezes money terms once live", async () => {
    const { id } = await createCampaign(brand, { status: "DRAFT" });
    const patch = (body: object) => brand.agent.patch(`/api/campaigns/${id}`).set("x-csrf-token", brand.csrf).send(body);
    await patch({ budgetPaise: rs(30_000), milestones: [{ views: 5_000, payoutPaise: rs(100) }] }).expect(200);
    await patch({ status: "LIVE" }).expect(200);
    const locked = await patch({ budgetPaise: rs(1_000) }).expect(409);
    expect(locked.body.error.code).toBe("FIELDS_LOCKED");
    await patch({ milestones: DEFAULT_LADDER }).expect(409);
    await patch({ name: "Renamed", description: "Updated brief" }).expect(200);
  });

  it("validates the merged ladder/budget on draft edits", async () => {
    const { id } = await createCampaign(brand, { status: "DRAFT", budgetPaise: rs(5_000) });
    const res = await brand.agent.patch(`/api/campaigns/${id}`).set("x-csrf-token", brand.csrf).send({ budgetPaise: rs(4_999) }).expect(422);
    expect(res.body.error.message).toMatch(/highest milestone payout/);
  });

  it("allows budget top-ups that only ever increase the budget", async () => {
    const { id } = await createCampaign(brand);
    const res = await brand.agent.post(`/api/campaigns/${id}/budget/top-ups`).set("x-csrf-token", brand.csrf).send({ amountPaise: rs(5_000) }).expect(200);
    expect(res.body.data.campaign.budget.budgetPaise).toBe(rs(25_000));
    await brand.agent.post(`/api/campaigns/${id}/budget/top-ups`).set("x-csrf-token", brand.csrf).send({ amountPaise: -100 }).expect(422);
  });

  it("filters the brand's own list by status and platform", async () => {
    await createCampaign(brand, { status: "DRAFT", platform: "YOUTUBE" });
    await createCampaign(brand, { status: "LIVE", platform: "INSTAGRAM" });
    const drafts = await brand.agent.get("/api/campaigns?status=DRAFT").expect(200);
    expect(drafts.body.data.items).toHaveLength(1);
    const ig = await brand.agent.get("/api/campaigns?platform=INSTAGRAM").expect(200);
    expect(ig.body.data.items).toHaveLength(1);
    await brand.agent.get("/api/campaigns?status=bogus").expect(422);
  });

  it("serves analytics including an integrity check", async () => {
    const { id } = await createCampaign(brand);
    const res = await brand.agent.get(`/api/campaigns/${id}/analytics`).expect(200);
    expect(res.body.data.integrity.consistent).toBe(true);
    expect(res.body.data.milestoneDistribution).toHaveLength(4);
  });
});

describe("brand summary", () => {
  it("aggregates only the brand's own published campaigns", async () => {
    await createCampaign(brand, { budgetPaise: rs(10_000) });
    await createCampaign(brand, { budgetPaise: rs(7_000), status: "DRAFT" });
    await createCampaign(otherBrand, { budgetPaise: rs(99_000) });
    const res = await brand.agent.get("/api/brand/summary").expect(200);
    expect(res.body.data.budget.budgetPaise).toBe(rs(10_000));
    expect(res.body.data.campaignsByStatus).toEqual({ LIVE: 1, DRAFT: 1 });
    expect(res.body.data.activeCampaigns).toHaveLength(1);
    await creator.agent.get("/api/brand/summary").expect(403);
  });
});
