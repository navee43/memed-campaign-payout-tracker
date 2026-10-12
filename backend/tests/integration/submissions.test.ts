import type { Express } from "express";
import { Campaign } from "../../src/models/campaign.model";
import { Submission } from "../../src/models/submission.model";
import { createCampaign, registerUser, resetDatabase, startIntegration, stopIntegration, submitPost, type TestUser } from "../helpers/integration";

let app: Express;
let brand: TestUser;
let creator: TestUser;
let otherCreator: TestUser;

beforeAll(async () => {
  app = await startIntegration("submissions");
});
afterAll(stopIntegration);
beforeEach(async () => {
  await resetDatabase();
  brand = await registerUser(app, "BRAND");
  creator = await registerUser(app, "CREATOR", "Creator A");
  otherCreator = await registerUser(app, "CREATOR", "Creator B");
});

const submit = (who: TestUser, campaignId: string, postUrl: string) =>
  who.agent.post(`/api/campaigns/${campaignId}/submissions`).set("x-csrf-token", who.csrf).send({ postUrl });

describe("post submission", () => {
  it("accepts a valid post and canonicalises the URL", async () => {
    const { id } = await createCampaign(brand, { platform: "YOUTUBE" });
    const res = await submit(creator, id, "https://youtube.com/shorts/dQw4w9WgXcQ?feature=share").expect(201);
    expect(res.body.data.submission).toMatchObject({
      postUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      currentViews: 0,
      eligiblePaise: 0,
      allocatedPaise: 0,
      fundingStatus: "NOT_ELIGIBLE",
      nextMilestone: { views: 10_000 },
    });
    expect((await Campaign.findById(id).lean())!.submissionCount).toBe(1);
  });

  it("rejects links for the wrong platform and junk URLs", async () => {
    const { id } = await createCampaign(brand, { platform: "INSTAGRAM" });
    const wrong = await submit(creator, id, "https://youtu.be/dQw4w9WgXcQ").expect(422);
    expect(wrong.body.error.code).toBe("INVALID_POST_URL");
    await submit(creator, id, "https://evil.example/p/abc").expect(422);
    await submit(creator, id, "javascript:alert(1)").expect(422);
    await submit(creator, id, "").expect(422);
  });

  it("rejects duplicates by the same creator, including equivalent URL forms", async () => {
    const { id } = await createCampaign(brand, { platform: "YOUTUBE" });
    await submit(creator, id, "https://www.youtube.com/watch?v=dQw4w9WgXcQ").expect(201);
    const dup = await submit(creator, id, "https://youtu.be/dQw4w9WgXcQ").expect(409);
    expect(dup.body.error.code).toBe("DUPLICATE_SUBMISSION");
    expect(await Submission.countDocuments()).toBe(1);
  });

  it("stops a different creator claiming an already-submitted post", async () => {
    const { id } = await createCampaign(brand);
    await submit(creator, id, "https://www.instagram.com/reel/CxShared01/").expect(201);
    const res = await submit(otherCreator, id, "https://instagram.com/reel/CxShared01").expect(409);
    expect(res.body.error.code).toBe("POST_ALREADY_CLAIMED");
  });

  it("enforces uniqueness under concurrent duplicate submissions", async () => {
    const { id } = await createCampaign(brand);
    const results = await Promise.all(Array.from({ length: 6 }, () => submit(creator, id, "https://www.instagram.com/p/CxRace001/")));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await Submission.countDocuments()).toBe(1);
    expect((await Campaign.findById(id).lean())!.submissionCount).toBe(1);
  });

  it("only accepts submissions while the campaign is open", async () => {
    const draft = await createCampaign(brand, { status: "DRAFT" });
    await submit(creator, draft.id, "https://www.instagram.com/p/CxDraft01/").expect(404);

    const live = await createCampaign(brand);
    await brand.agent.patch(`/api/campaigns/${live.id}`).set("x-csrf-token", brand.csrf).send({ status: "PAUSED" }).expect(200);
    const paused = await submit(creator, live.id, "https://www.instagram.com/p/CxPaused1/").expect(409);
    expect(paused.body.error.code).toBe("SUBMISSIONS_CLOSED");

    const future = await createCampaign(brand, { startsAt: new Date(Date.now() + 86_400_000).toISOString() });
    await submit(creator, future.id, "https://www.instagram.com/p/CxFuture1/").expect(409);
  });

  it("forbids brands from submitting posts", async () => {
    const { id } = await createCampaign(brand);
    await submit(brand, id, "https://www.instagram.com/p/CxBrand01/").expect(403);
  });
});

describe("submission visibility", () => {
  it("lets creators see only their own submissions", async () => {
    const { id } = await createCampaign(brand);
    const mine = await submitPost(creator, id);
    await submitPost(otherCreator, id);

    const list = await creator.agent.get("/api/submissions/mine").expect(200);
    expect(list.body.data.items.map((s: { id: string }) => s.id)).toEqual([mine]);
    const other = await createCampaign(brand);
    const scoped = await creator.agent.get(`/api/submissions/mine?campaignId=${other.id}`).expect(200);
    expect(scoped.body.data.items).toHaveLength(0);
    await otherCreator.agent.get(`/api/submissions/${mine}`).expect(404);
    const detail = await creator.agent.get(`/api/submissions/${mine}`).expect(200);
    expect(detail.body.data.submission.viewHistory).toHaveLength(1);
    expect(detail.body.data.submission.milestones).toHaveLength(3);
  });

  it("lets the owning brand (only) see campaign submissions", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    const res = await brand.agent.get(`/api/campaigns/${id}/submissions`).expect(200);
    expect(res.body.data.items[0]).toMatchObject({ id: sub, creatorName: "Creator A" });
    await brand.agent.get(`/api/submissions/${sub}`).expect(200);

    const stranger = await registerUser(app, "BRAND");
    await stranger.agent.get(`/api/submissions/${sub}`).expect(404);
    await creator.agent.get(`/api/campaigns/${id}/submissions`).expect(403);
  });

  it("lets a brand reject an unpaid submission but not reverse earnings", async () => {
    const { id } = await createCampaign(brand);
    const sub = await submitPost(creator, id);
    await brand.agent.post(`/api/submissions/${sub}/reject`).set("x-csrf-token", brand.csrf).send({ reason: "Off brief" }).expect(200);
    const again = await brand.agent.post(`/api/submissions/${sub}/reject`).set("x-csrf-token", brand.csrf).send({ reason: "Off brief" }).expect(409);
    expect(again.body.error.code).toBe("ALREADY_REJECTED");
  });
});
