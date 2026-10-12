/**
 * Demo data for local development and evaluation. Every number shown in the
 * app afterwards is produced by the real API code paths (campaign creation,
 * submissions, the payout engine) — nothing is written directly into money fields.
 */
import { connectDatabase, disconnectDatabase } from "../config/db";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { initModels } from "../models";
import { User } from "../models/user.model";
import { signup } from "../services/auth/auth.service";
import { createCampaign } from "../services/campaign.service";
import { applyViewUpdate } from "../services/payout/payout-engine.service";
import { createSubmission } from "../services/submission.service";
import type { RequestContext } from "../types/context";
import type { AuthUser } from "../types/domain";
import { rupeesToPaise } from "../utils/money";

const ctx: RequestContext = { requestId: "seed", ip: null, userAgent: "seed-script" };
export const DEMO_PASSWORD = "MemedDemo2026";

async function account(name: string, email: string, role: "BRAND" | "CREATOR"): Promise<AuthUser> {
  const existing = await User.findOne({ email });
  if (existing) return { id: String(existing._id), role: existing.role, name: existing.name, email };
  return (await signup({ name, email, password: DEMO_PASSWORD, role }, ctx)).user;
}

const ladder = (pairs: [number, number][]) => pairs.map(([views, rupees]) => ({ views, payoutPaise: rupeesToPaise(rupees) }));

async function main() {
  const cfg = env();
  if (cfg.isProduction && process.env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error("Refusing to seed a production database (set SEED_ALLOW_PRODUCTION=true for a disposable demo).");
  }
  await connectDatabase();
  await initModels();

  if (await User.exists({ email: "brand@memed.demo" })) {
    logger.info("demo data already present — nothing to do");
    await disconnectDatabase();
    return;
  }

  const brand = await account("Chai Point Studios", "brand@memed.demo", "BRAND");
  const brand2 = await account("Byte Sneakers", "brand2@memed.demo", "BRAND");
  const creatorA = await account("Desi Meme Daily", "creator@memed.demo", "CREATOR");
  const creatorB = await account("Clip Factory", "creator2@memed.demo", "CREATOR");

  const monsoon = await createCampaign(
    brand,
    {
      name: "Monsoon Chai Memes",
      description: "Make the internet laugh about rainy-day chai cravings. Tag @chaipoint and keep it wholesome.",
      platform: "INSTAGRAM",
      budgetPaise: rupeesToPaise(25_000),
      milestones: ladder([[10_000, 500], [50_000, 2_000], [100_000, 5_000]]),
      status: "LIVE",
      coverTheme: 1,
    },
    ctx,
  );
  const sneaker = await createCampaign(
    brand2,
    {
      name: "Sneaker Drop Shorts",
      description: "Short-form edits around the new Byte Runner drop. Fast cuts, good music, no stolen footage.",
      platform: "YOUTUBE",
      budgetPaise: rupeesToPaise(8_000),
      milestones: ladder([[25_000, 1_000], [100_000, 4_000], [500_000, 6_000]]),
      status: "LIVE",
      coverTheme: 3,
    },
    ctx,
  );
  await createCampaign(
    brand,
    {
      name: "Diwali Gifting Reels",
      description: "Festive gifting ideas — still being planned.",
      platform: "INSTAGRAM",
      budgetPaise: rupeesToPaise(50_000),
      milestones: ladder([[20_000, 1_000], [80_000, 3_500]]),
      status: "DRAFT",
      coverTheme: 4,
    },
    ctx,
  );

  const s1 = await createSubmission(creatorA, monsoon.id, "https://www.instagram.com/reel/CxMemed01a/", ctx);
  const s2 = await createSubmission(creatorB, monsoon.id, "https://www.instagram.com/p/CxMemed02b/", ctx);
  const s3 = await createSubmission(creatorA, sneaker.id, "https://youtube.com/shorts/aB3dE5gH7jK", ctx);
  const s4 = await createSubmission(creatorB, sneaker.id, "https://www.youtube.com/watch?v=Zx9Yw8Vu7Ts", ctx);

  const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
  const views = async (id: string, steps: [number, number][]) => {
    for (const [v, h] of steps) await applyViewUpdate({ submissionId: id, views: v, observedAt: hoursAgo(h), actor: "SIMULATION", ctx });
  };
  await views(s1.id, [[4_200, 30], [18_500, 20], [41_000, 10], [65_000, 2]]);
  // A sudden jump 12 minutes after the last snapshot trips the view-spike heuristic (for review, payout unaffected).
  await views(s2.id, [[2_100, 26], [6_400, 12], [9_800, 3], [160_000, 2.8]]);
  await views(s3.id, [[30_000, 40], [120_000, 20]]);
  // Exhausts the ₹8,000 budget: ₹4,000 eligible, only ₹4,000 left -> fully funded; then the next milestone is partial.
  await views(s4.id, [[60_000, 30], [140_000, 6]]);
  await views(s3.id, [[540_000, 1]]);

  logger.info(
    { brand: "brand@memed.demo", brand2: "brand2@memed.demo", creators: ["creator@memed.demo", "creator2@memed.demo"], demoPassword: DEMO_PASSWORD },
    "demo data seeded",
  );
  await disconnectDatabase();
}

main().catch(async (err: unknown) => {
  logger.fatal({ err }, "seed failed");
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
