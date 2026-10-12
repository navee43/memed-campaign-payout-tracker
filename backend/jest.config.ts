import type { Config } from "jest";

const tsJest: Config["transform"] = {
  "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json", diagnostics: { warnOnly: false } }],
};

const config: Config = {
  testEnvironment: "node",
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      transform: tsJest,
      testMatch: ["<rootDir>/tests/unit/**/*.test.ts"],
      setupFiles: ["<rootDir>/tests/helpers/test-env.ts"],
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      transform: tsJest,
      testMatch: ["<rootDir>/tests/integration/**/*.test.ts"],
      setupFiles: ["<rootDir>/tests/helpers/test-env.ts"],
      globalSetup: "<rootDir>/tests/helpers/global-setup.ts",
      globalTeardown: "<rootDir>/tests/helpers/global-teardown.ts",
      slowTestThreshold: 20,
    },
  ],
};

export default config;
