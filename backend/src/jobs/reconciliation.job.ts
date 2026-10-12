import { randomUUID } from "node:crypto";
import { logger } from "../config/logger";
import { findCampaignsNeedingReconciliation, reconcileCampaign } from "../services/payout/payout-engine.service";
import { withJobLock } from "./lock";

/**
 * Safety-net reconciliation. Budget top-ups already back-fill the queue in the
 * same transaction; this job catches anything left behind (e.g. a queue longer
 * than one batch, or a crash between batches) by repeatedly applying the same
 * idempotent, deterministic allocation step.
 */
export async function runReconciliationOnce(): Promise<{ campaigns: number; allocatedPaise: number }> {
  const runId = `job:${randomUUID()}`;
  const ids = await findCampaignsNeedingReconciliation();
  let allocatedPaise = 0;
  for (const id of ids) {
    try {
      const outcome = await reconcileCampaign(id, runId);
      allocatedPaise += outcome.allocatedPaise;
    } catch (err) {
      logger.error({ err, campaignId: id, runId }, "reconciliation failed for campaign");
    }
  }
  return { campaigns: ids.length, allocatedPaise };
}

export function startReconciliationJob(intervalSeconds: number): () => void {
  if (intervalSeconds <= 0) {
    logger.info("reconciliation job disabled");
    return () => undefined;
  }
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const result = await withJobLock("reconciliation", intervalSeconds * 1000, runReconciliationOnce);
      if (result && result.campaigns > 0) logger.info(result, "reconciliation run complete");
    } catch (err) {
      logger.error({ err }, "reconciliation run failed");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalSeconds * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
