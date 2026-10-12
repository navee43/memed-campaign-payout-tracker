/**
 * Display formatting only. Money arrives from the API as integer paise and is
 * never re-calculated here — the backend is the source of truth.
 */

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrExact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat("en-IN");

/** ₹2,000 or ₹1,999.50 — drops ".00" for whole rupees. */
export function formatINR(paise: number): string {
  return paise % 100 === 0 ? inr.format(paise / 100) : inrExact.format(paise / 100);
}

export function formatNumber(n: number): string {
  return num.format(n);
}

const oneDecimal = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

/** Indian compact notation as creators say it: 12K, 1.2L (lakh), 3.4Cr (crore). */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${oneDecimal.format(n / 1e7)}Cr`;
  if (abs >= 1e5) return `${oneDecimal.format(n / 1e5)}L`;
  if (abs >= 1e3) return `${oneDecimal.format(n / 1e3)}K`;
  return oneDecimal.format(n);
}

export function formatPercent(pct: number): string {
  return `${pct.toLocaleString("en-IN", { maximumFractionDigits: 1 })}%`;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function formatDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : "—";
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  const diffSec = (new Date(iso).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  return rtf.format(Math.round(diffSec / 86_400), "day");
}

/**
 * Converts what a person typed in a rupee field to integer paise using string
 * arithmetic (no float drift). Returns null when the text isn't a valid amount.
 */
export function rupeesInputToPaise(text: string): number | null {
  const t = text.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole = "0", frac = ""] = t.split(".");
  const paise = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return Number.isSafeInteger(paise) ? paise : null;
}

export function paiseToRupeesInput(paise: number): string {
  const r = Math.floor(paise / 100);
  const p = paise % 100;
  return p === 0 ? String(r) : `${r}.${String(p).padStart(2, "0")}`;
}

export function viewsInputToNumber(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) ? n : null;
}
