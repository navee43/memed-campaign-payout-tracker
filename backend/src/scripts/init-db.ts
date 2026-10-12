/**
 * Non-destructive database initialisation: creates collections and any
 * missing indexes. Never drops indexes or data (unlike syncIndexes), so it is
 * safe to run on every deploy.
 */
import { connectDatabase, disconnectDatabase } from "../config/db";
import { logger } from "../config/logger";
import { createAllIndexes } from "../models";

async function main() {
  await connectDatabase();
  await createAllIndexes();
  logger.info("collections and indexes are in place");
  await disconnectDatabase();
}

main().catch((err: unknown) => {
  logger.fatal({ err }, "db init failed");
  process.exit(1);
});
