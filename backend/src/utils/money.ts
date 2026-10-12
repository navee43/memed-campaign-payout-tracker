/**
 * All money is stored and computed as integer paise (1 INR = 100 paise).
 * Floating-point rupee values only exist at the UI boundary.
 */

export const PAISE_PER_RUPEE = 100;

/** Upper bound for any single monetary value: ₹10 crore. Keeps sums far inside Number.MAX_SAFE_INTEGER. */
export const MAX_PAISE = 10_00_00_000 * PAISE_PER_RUPEE;

export function isValidPaise(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_PAISE;
}

export function assertPaise(value: unknown, label = "amount"): asserts value is number {
  if (!isValidPaise(value)) {
    throw new RangeError(`${label} must be a non-negative integer number of paise not exceeding ${MAX_PAISE}`);
  }
}

/**
 * Converts a rupee amount (number or decimal string with at most 2 decimals)
 * to paise without floating-point drift: "1999.99" -> 199999.
 */
export function rupeesToPaise(input: number | string): number {
  const text = typeof input === "number" ? input.toString() : input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new RangeError("Rupee amount must be a non-negative number with at most 2 decimal places");
  }
  const [whole = "0", fraction = ""] = text.split(".");
  const paise = Number(whole) * PAISE_PER_RUPEE + Number(fraction.padEnd(2, "0"));
  assertPaise(paise, "amount");
  return paise;
}

export function paiseToRupeesString(paise: number): string {
  assertPaise(paise);
  const rupees = Math.floor(paise / PAISE_PER_RUPEE);
  const rem = paise % PAISE_PER_RUPEE;
  return rem === 0 ? `${rupees}` : `${rupees}.${rem.toString().padStart(2, "0")}`;
}

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export function formatINR(paise: number): string {
  return inr.format(paise / PAISE_PER_RUPEE);
}
