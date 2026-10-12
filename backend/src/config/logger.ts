import pino from "pino";

/**
 * Structured JSON logger. Secrets that could appear in request logs are
 * redacted at the logger level so a careless log line cannot leak them.
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
  base: { service: "memed-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-service-key']",
      "req.headers['x-csrf-token']",
      "res.headers['set-cookie']",
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "token",
      "*.token",
    ],
    censor: "[redacted]",
  },
});

export type Logger = typeof logger;
