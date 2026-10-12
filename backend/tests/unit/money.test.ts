import { formatINR, isValidPaise, MAX_PAISE, paiseToRupeesString, rupeesToPaise } from "../../src/utils/money";

describe("integer paise handling", () => {
  it.each([
    ["0", 0],
    ["1", 100],
    ["1999.99", 199_999],
    ["0.1", 10],
    ["0.05", 5],
    ["500", 50_000],
    [2000, 200_000],
    [19.99, 1_999],
  ])("rupeesToPaise(%p) = %i", (input, expected) => {
    expect(rupeesToPaise(input)).toBe(expected);
  });

  it("avoids floating-point drift (0.1 + 0.2 rupees)", () => {
    expect(rupeesToPaise("0.1") + rupeesToPaise("0.2")).toBe(30);
  });

  it.each(["-1", "1.234", "abc", "", "1e3", "1,000"])("rejects %p", (input) => {
    expect(() => rupeesToPaise(input)).toThrow(RangeError);
  });

  it("rejects amounts above the ceiling", () => {
    expect(() => rupeesToPaise(String(MAX_PAISE))).toThrow(RangeError);
  });

  it("validates paise values", () => {
    expect(isValidPaise(0)).toBe(true);
    expect(isValidPaise(10.5)).toBe(false);
    expect(isValidPaise(-1)).toBe(false);
    expect(isValidPaise(MAX_PAISE + 1)).toBe(false);
  });

  it("formats paise back to rupees", () => {
    expect(paiseToRupeesString(199_999)).toBe("1999.99");
    expect(paiseToRupeesString(50_000)).toBe("500");
    expect(paiseToRupeesString(5)).toBe("0.05");
    expect(formatINR(2_000_00)).toBe("₹2,000.00");
    expect(formatINR(1_00_000_00)).toBe("₹1,00,000.00"); // Indian digit grouping
  });
});
