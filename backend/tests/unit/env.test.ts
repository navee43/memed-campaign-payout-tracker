import { parseEnv } from "../../src/config/env";

const valid = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb+srv://user:pass@cluster.example.mongodb.net/memed",
  JWT_ACCESS_SECRET: "x".repeat(40),
  VIEW_UPDATE_MODE: "simulation",
};

describe("environment validation (fail fast)", () => {
  it("accepts a minimal valid development config with defaults", () => {
    const cfg = parseEnv(valid);
    expect(cfg.PORT).toBe(4000);
    expect(cfg.COOKIE_SECURE).toBe(false);
    expect(cfg.DB_AUTO_INDEX).toBe(true);
  });

  it("requires MONGODB_URI", () => {
    expect(() => parseEnv({ ...valid, MONGODB_URI: undefined })).toThrow(/MONGODB_URI/);
  });

  it("requires a long JWT secret", () => {
    expect(() => parseEnv({ ...valid, JWT_ACCESS_SECRET: "short" })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it("requires a service key in internal mode", () => {
    expect(() => parseEnv({ ...valid, VIEW_UPDATE_MODE: "internal" })).toThrow(/VIEW_UPDATE_SERVICE_KEY/);
    expect(() => parseEnv({ ...valid, VIEW_UPDATE_MODE: "internal", VIEW_UPDATE_SERVICE_KEY: "k".repeat(32) })).not.toThrow();
  });

  it("refuses simulation mode in production unless explicitly allowed", () => {
    const prod = { ...valid, NODE_ENV: "production", CORS_ORIGINS: "https://app.example.com" };
    expect(() => parseEnv(prod)).toThrow(/refused in production/);
    expect(() => parseEnv({ ...prod, ALLOW_VIEW_SIMULATION_IN_PRODUCTION: "true" })).not.toThrow();
  });

  it("requires CORS origins in production and secures cookies by default", () => {
    const prod = { ...valid, NODE_ENV: "production", VIEW_UPDATE_MODE: "internal", VIEW_UPDATE_SERVICE_KEY: "k".repeat(32) };
    expect(() => parseEnv(prod)).toThrow(/CORS_ORIGINS/);
    const cfg = parseEnv({ ...prod, CORS_ORIGINS: "https://app.example.com" });
    expect(cfg.COOKIE_SECURE).toBe(true);
    expect(cfg.DB_AUTO_INDEX).toBe(false);
  });

  it("rejects malformed numbers", () => {
    expect(() => parseEnv({ ...valid, PORT: "abc" })).toThrow(/PORT/);
  });
});
