import { applyLegacyMongodShim } from "./legacy-mongod-shim";

applyLegacyMongodShim();

/**
 * Runs before every test file (before any app module is imported) so the
 * validated configuration sees test values. Test data never touches a
 * production database: integration tests use an ephemeral replica set or the
 * explicit MONGODB_TEST_URI.
 */
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  MONGODB_URI: process.env.MONGODB_TEST_URI ?? "mongodb://127.0.0.1:1/unused-in-unit-tests",
  JWT_ACCESS_SECRET: "test-access-secret-that-is-long-enough-123456",
  VIEW_UPDATE_MODE: "internal",
  VIEW_UPDATE_SERVICE_KEY: "test-service-key-0123456789abcdef0123456789",
  CORS_ORIGINS: "http://localhost:3000",
  RATE_LIMIT_MAX: "100000",
  AUTH_RATE_LIMIT_MAX: "100000",
  VIEW_UPDATE_RATE_LIMIT_MAX: "100000",
  VIEW_UPDATE_PER_SUBMISSION_MAX: "100000",
  RECONCILIATION_INTERVAL_SECONDS: "0",
  TRANSACTION_MAX_ATTEMPTS: "12",
  REDIS_KEY_PREFIX: `memed-test-${process.pid}:`,
};
for (const [k, v] of Object.entries(defaults)) {
  if (process.env[k] === undefined || k === "NODE_ENV" || k === "MONGODB_URI") process.env[k] = v;
}
// Redis is optional in tests: set TEST_REDIS_URL to exercise the real cache/limiter.
if (process.env.TEST_REDIS_URL) process.env.REDIS_URL = process.env.TEST_REDIS_URL;
else delete process.env.REDIS_URL;
