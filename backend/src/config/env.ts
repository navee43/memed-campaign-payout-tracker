import { z } from "zod";

/**
 * Environment configuration.
 *
 * Every variable is validated once at startup. Missing or malformed essential
 * configuration aborts the process with a readable message (fail fast) rather
 * than surfacing later as a confusing runtime error.
 */

const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => (v === undefined ? fallback : v === "true" || v === "1"));

const int = (fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  z.coerce.number().int().min(min).max(max).default(fallback);

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );

const rawSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: int(4000, 1, 65535),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required (MongoDB Atlas connection string)"),
  MONGODB_DB_NAME: z.string().optional(),
  MONGODB_MAX_POOL_SIZE: int(20, 1, 500),
  DB_AUTO_INDEX: z.enum(["true", "false", "1", "0"]).optional(),

  REDIS_URL: z.string().optional(),
  REDIS_KEY_PREFIX: z.string().default("memed:"),
  REDIS_COMMAND_TIMEOUT_MS: int(250, 10, 10_000),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL_SECONDS: int(900, 60, 3600),
  JWT_ISSUER: z.string().default("memed-api"),
  JWT_AUDIENCE: z.string().default("memed-web"),
  REFRESH_TOKEN_TTL_DAYS: int(14, 1, 90),
  REFRESH_REUSE_GRACE_SECONDS: int(10, 0, 120),

  COOKIE_SECURE: z.enum(["true", "false", "1", "0"]).optional(),
  COOKIE_DOMAIN: z.string().optional(),
  COOKIE_SAMESITE: z.enum(["lax", "strict"]).default("lax"),
  CORS_ORIGINS: csv,
  TRUST_PROXY: int(0, 0, 10),

  VIEW_UPDATE_MODE: z.enum(["internal", "simulation"]).default("internal"),
  VIEW_UPDATE_SERVICE_KEY: z.string().optional(),
  ALLOW_VIEW_SIMULATION_IN_PRODUCTION: bool(false),

  RATE_LIMIT_WINDOW_SECONDS: int(60, 1, 3600),
  RATE_LIMIT_MAX: int(300, 1),
  AUTH_RATE_LIMIT_WINDOW_SECONDS: int(900, 1, 86_400),
  AUTH_RATE_LIMIT_MAX: int(30, 1),
  VIEW_UPDATE_RATE_LIMIT_MAX: int(120, 1),
  VIEW_UPDATE_PER_SUBMISSION_MAX: int(30, 1),
  LOGIN_MAX_FAILED_ATTEMPTS: int(5, 1, 100),
  LOGIN_LOCKOUT_MINUTES: int(15, 1, 1440),

  CAMPAIGN_CACHE_TTL_SECONDS: int(30, 1, 3600),

  VIEW_SPIKE_WINDOW_MINUTES: int(60, 1, 10_080),
  VIEW_SPIKE_MIN_INCREASE: int(50_000, 1),
  VIEW_SPIKE_RATE_MULTIPLIER: z.coerce.number().min(1).max(1000).default(8),
  VIEW_SPIKE_MIN_HISTORY: int(3, 1, 50),
  VIEW_SPIKE_ABSOLUTE_CEILING: int(1_000_000, 1),

  RECONCILIATION_INTERVAL_SECONDS: int(300, 0, 86_400),
  TRANSACTION_MAX_ATTEMPTS: int(10, 1, 20),
  MAX_SUBMISSIONS_PER_CREATOR_PER_CAMPAIGN: int(10, 1, 1000),

  REQUEST_BODY_LIMIT: z.string().default("100kb"),
  REQUEST_TIMEOUT_MS: int(15_000, 1000, 120_000),
  SHUTDOWN_GRACE_MS: int(15_000, 0, 120_000),
});

export type RawEnv = z.input<typeof rawSchema>;

function refine(raw: z.output<typeof rawSchema>) {
  const isProd = raw.NODE_ENV === "production";
  const errors: string[] = [];

  if (raw.VIEW_UPDATE_MODE === "internal" && (raw.VIEW_UPDATE_SERVICE_KEY ?? "").length < 32) {
    errors.push(
      "VIEW_UPDATE_SERVICE_KEY must be at least 32 characters when VIEW_UPDATE_MODE=internal",
    );
  }
  if (isProd && raw.VIEW_UPDATE_MODE === "simulation" && !raw.ALLOW_VIEW_SIMULATION_IN_PRODUCTION) {
    errors.push(
      "VIEW_UPDATE_MODE=simulation is refused in production. Use internal mode, or set ALLOW_VIEW_SIMULATION_IN_PRODUCTION=true for a disposable demo deployment.",
    );
  }
  if (isProd && raw.CORS_ORIGINS.length === 0) {
    errors.push("CORS_ORIGINS must list the frontend origin(s) in production");
  }
  if (errors.length > 0) {
    throw new Error(`Invalid configuration:\n  - ${errors.join("\n  - ")}`);
  }

  const parseBool = (v: string | undefined, fallback: boolean) =>
    v === undefined ? fallback : v === "true" || v === "1";

  return {
    ...raw,
    isProduction: isProd,
    isTest: raw.NODE_ENV === "test",
    DB_AUTO_INDEX: parseBool(raw.DB_AUTO_INDEX, !isProd),
    COOKIE_SECURE: parseBool(raw.COOKIE_SECURE, isProd),
    CORS_ORIGINS:
      raw.CORS_ORIGINS.length > 0 ? raw.CORS_ORIGINS : ["http://localhost:3000", "http://127.0.0.1:3000"],
  };
}

export type Env = ReturnType<typeof refine>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const parsed = rawSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n  - ");
    throw new Error(`Invalid configuration:\n  - ${issues}`);
  }
  return refine(parsed.data);
}

let cached: Env | undefined;

/** Lazily parsed, process-wide configuration. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test hook: re-read configuration after mutating process.env. */
export function resetEnvCache(): void {
  cached = undefined;
}
