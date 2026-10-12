import type { Server } from "node:http";
import { connectDatabase, disconnectDatabase } from "./config/db";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { connectRedis, disconnectRedis } from "./config/redis";
import { createApp } from "./app";
import { markShuttingDown } from "./controllers/health.controller";
import { startReconciliationJob } from "./jobs/reconciliation.job";
import { initModels } from "./models";

async function main(): Promise<void> {
  let cfg;
  try {
    cfg = env(); // fail fast on bad configuration
  } catch (err) {
    logger.fatal((err as Error).message);
    process.exit(1);
  }

  await connectDatabase();
  await initModels();
  await connectRedis();

  const app = createApp();
  const server: Server = app.listen(cfg.PORT, () => logger.info({ port: cfg.PORT, env: cfg.NODE_ENV }, "Meme'd API listening"));
  server.requestTimeout = cfg.REQUEST_TIMEOUT_MS;
  server.headersTimeout = Math.min(cfg.REQUEST_TIMEOUT_MS, 60_000);
  // Must exceed the ALB idle timeout (60s) to avoid 502s on reused connections.
  server.keepAliveTimeout = 65_000;

  const stopJob = startReconciliationJob(cfg.RECONCILIATION_INTERVAL_SECONDS);

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info({ signal }, "shutting down: draining connections");
    markShuttingDown();
    stopJob();
    const force = setTimeout(() => {
      logger.warn("forcing shutdown after grace period");
      process.exit(1);
    }, cfg.SHUTDOWN_GRACE_MS);
    force.unref();
    server.close(() => {
      void (async () => {
        await Promise.allSettled([disconnectDatabase(), disconnectRedis()]);
        logger.info("shutdown complete");
        process.exit(0);
      })();
    });
    server.closeIdleConnections();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => logger.error({ reason }, "unhandled promise rejection"));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "failed to start");
  process.exit(1);
});
