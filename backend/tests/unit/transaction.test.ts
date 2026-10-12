import { backoffMs, isTransientError } from "../../src/services/payout/transaction";
import { ConcurrencyConflictError } from "../../src/utils/errors";

describe("transaction retry classification", () => {
  it("retries our optimistic-lock conflicts", () => {
    expect(isTransientError(new ConcurrencyConflictError())).toBe(true);
  });

  it("retries MongoDB transient transaction errors and write conflicts", () => {
    expect(isTransientError({ hasErrorLabel: (l: string) => l === "TransientTransactionError" })).toBe(true);
    expect(isTransientError({ code: 112 })).toBe(true);
    expect(isTransientError({ codeName: "WriteConflict" })).toBe(true);
  });

  it("does not retry business errors", () => {
    expect(isTransientError(new Error("nope"))).toBe(false);
    expect(isTransientError({ code: 11000 })).toBe(false);
    expect(isTransientError(undefined)).toBe(false);
  });

  it("keeps backoff bounded", () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const ms = backoffMs(attempt);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThan(1_000);
    }
  });
});
