import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { csrfProtection } from "./middleware/csrf";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { byIp, rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { buildRouter } from "./routes";

export function createApp(): Express {
  const cfg = env();
  const app = express();

  app.disable("x-powered-by");
  // Behind the ALB (1 hop) req.ip must come from X-Forwarded-For, or every user shares one rate-limit bucket.
  app.set("trust proxy", cfg.TRUST_PROXY);
  // Express 5's default "simple" parser never builds nested objects from the
  // query string, which closes the classic ?field[$ne]= NoSQL-injection route.
  app.set("query parser", "simple");

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as unknown as { id: string }).id,
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"),
      autoLogging: { ignore: (req) => req.url?.startsWith("/api/health") ?? false },
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }),
      },
    }),
  );
  app.use(
    helmet({
      // JSON API: lock everything down; the frontend is served separately.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: "same-site" },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || cfg.CORS_ORIGINS.includes(origin)),
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-CSRF-Token", "Idempotency-Key", "X-Request-Id", "X-Service-Key"],
      exposedHeaders: ["X-Request-Id", "X-Cache", "RateLimit-Limit", "RateLimit-Remaining", "RateLimit-Reset", "Retry-After"],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: cfg.REQUEST_BODY_LIMIT, strict: true }));
  app.use(cookieParser());
  app.use(
    "/api",
    rateLimit({
      name: "api",
      windowMs: cfg.RATE_LIMIT_WINDOW_SECONDS * 1000,
      max: cfg.RATE_LIMIT_MAX,
      // Load-balancer health probes are exempt.
      key: (req) => (req.path.startsWith("/health") ? null : byIp(req)),
    }),
  );
  app.use(csrfProtection);
  app.use("/api", buildRouter());
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
