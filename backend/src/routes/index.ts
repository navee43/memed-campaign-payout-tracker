import { Router } from "express";
import { env } from "../config/env";
import * as authCtl from "../controllers/auth.controller";
import * as campaignCtl from "../controllers/campaign.controller";
import * as earningsCtl from "../controllers/earnings.controller";
import * as healthCtl from "../controllers/health.controller";
import * as submissionCtl from "../controllers/submission.controller";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth";
import { byIp, rateLimit } from "../middleware/rate-limit";
import { requireViewUpdateCaller } from "../middleware/service-auth";

export function buildRouter(): Router {
  const cfg = env();
  const r = Router();

  const authLimiter = rateLimit({
    name: "auth",
    windowMs: cfg.AUTH_RATE_LIMIT_WINDOW_SECONDS * 1000,
    max: cfg.AUTH_RATE_LIMIT_MAX,
    key: byIp,
    message: "Too many sign-in attempts from this network. Please wait a few minutes.",
  });
  const viewsByIp = rateLimit({ name: "views-ip", windowMs: 60_000, max: cfg.VIEW_UPDATE_RATE_LIMIT_MAX, key: byIp });
  const viewsBySubmission = rateLimit({
    name: "views-sub",
    windowMs: 60_000,
    max: cfg.VIEW_UPDATE_PER_SUBMISSION_MAX,
    key: (req) => (typeof req.params.id === "string" ? req.params.id : null),
    message: "Too many view updates for this submission. Please slow down.",
  });

  // Health & config (no auth)
  r.get("/health/live", healthCtl.live);
  r.get("/health/ready", healthCtl.ready);
  r.get("/config", healthCtl.publicConfig);

  // Auth
  r.get("/auth/csrf", authCtl.csrf);
  r.post("/auth/signup", authLimiter, authCtl.signup);
  r.post("/auth/login", authLimiter, authCtl.login);
  r.post("/auth/refresh", authLimiter, authCtl.refresh);
  r.post("/auth/logout", optionalAuth, authCtl.logout);
  r.post("/auth/logout-all", requireAuth, authCtl.logoutAll);
  r.get("/auth/me", requireAuth, authCtl.me);
  r.get("/auth/session", optionalAuth, authCtl.session);
  r.get("/auth/sessions", requireAuth, authCtl.sessions);

  // Brand portfolio summary
  r.get("/brand/summary", requireAuth, requireRole("BRAND"), campaignCtl.brandSummary);

  // Campaigns
  r.post("/campaigns", requireAuth, requireRole("BRAND"), campaignCtl.create);
  r.get("/campaigns", requireAuth, campaignCtl.list);
  r.get("/campaigns/:id", requireAuth, campaignCtl.get);
  r.patch("/campaigns/:id", requireAuth, requireRole("BRAND"), campaignCtl.update);
  r.get("/campaigns/:id/analytics", requireAuth, requireRole("BRAND"), campaignCtl.analytics);
  r.post("/campaigns/:id/budget/top-ups", requireAuth, requireRole("BRAND"), campaignCtl.topUp);
  r.post("/campaigns/:id/reconcile", requireAuth, requireRole("BRAND"), campaignCtl.reconcile);
  r.get("/campaigns/:id/submissions", requireAuth, requireRole("BRAND"), campaignCtl.listSubmissions);
  r.post("/campaigns/:id/submissions", requireAuth, requireRole("CREATOR"), campaignCtl.submit);
  r.get("/campaigns/:id/payout-ledger", requireAuth, requireRole("BRAND"), campaignCtl.ledger);

  // Submissions
  r.get("/submissions/mine", requireAuth, requireRole("CREATOR"), submissionCtl.mine);
  r.get("/submissions/:id", requireAuth, submissionCtl.get);
  // Intentionally no brand/creator role check (see service-auth.ts): trusted service key or explicit simulation mode.
  r.patch("/submissions/:id/views", viewsByIp, requireViewUpdateCaller, viewsBySubmission, submissionCtl.updateViews);
  r.post("/submissions/:id/reject", requireAuth, requireRole("BRAND"), submissionCtl.reject);
  r.post("/submissions/:id/anomaly/acknowledge", requireAuth, requireRole("BRAND"), submissionCtl.acknowledgeAnomaly);

  // Earnings
  r.get("/earnings/summary", requireAuth, requireRole("CREATOR"), earningsCtl.summary);
  r.get("/earnings/history", requireAuth, requireRole("CREATOR"), earningsCtl.history);

  return r;
}
