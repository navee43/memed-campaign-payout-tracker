/** One-off reconciliation run (same logic as the background job). */
import { connectDatabase, disconnectDatabase } from "../config/db";
import { logger } from "../config/logger";
import { runReconciliationOnce } from "../jobs/reconciliation.job";
import { initModels } from "../models";

async function main() {
  await connectDatabase();
  await initModels();
  const result = await runReconciliationOnce();
  logger.info(result, "reconciliation finished");
  await disconnectDatabase();
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "reconciliation failed");
  process.exit(1);
});
