// Turning messy spreadsheet text into dates, numbers and yes/no values.
export type DateFormat = "auto" | "MDY" | "DMY" | "YMD";

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");
const year = (y: string) => (y.length === 2 ? 2000 + Number(y) : Number(y));

function valid(y: number, m: number, d: number) {
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Returns YYYY-MM-DD, or null if the text is not a date. */
export function parseDate(input: unknown, fmt: DateFormat = "auto"): string | null {
  const s = String(input ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{8})$/);
  if (m) return valid(+s.slice(0, 4), +s.slice(4, 6), +s.slice(6, 8));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:\s.*)?$/);
  if (m) {
    const a = +m[1], b = +m[2], y = year(m[3]);
    if (fmt === "DMY") return valid(y, b, a);
    if (fmt === "MDY" || fmt === "YMD") return valid(y, a, b);
    if (a > 12) return valid(y, b, a);
    return valid(y, a, b); // US default
  }
  m = s.match(/^(\d{1,2})[-\s/]([A-Za-z]{3,9})[-\s/,]*(\d{2,4})$/); // 23-Dec-2025
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()]) return valid(year(m[3]), MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{2,4})$/); // Dec 23, 2025
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()]) return valid(year(m[3]), MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return null;
}

/** "$1,234.50", "(45.00)", "45.00-", "45.00 CR" -> number. null when not a number. */
export function parseNumber(input: unknown): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  let s = String(input ?? "").trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/-$/.test(s)) { neg = true; s = s.slice(0, -1); }
  if (/\s*(CR|DR)$/i.test(s)) { neg = /DR$/i.test(s); s = s.replace(/\s*(CR|DR)$/i, ""); }
  s = s.replace(/[$€£₹,\s]/g, "").replace(/^USD|USD$/i, "");
  if (!/^[-+]?\d*\.?\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null;
}

export function parseBool(input: unknown): boolean | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["1", "yes", "y", "true", "t", "taxable", "x"].includes(s)) return true;
  if (["0", "no", "n", "false", "f", "non", "non-taxable"].includes(s)) return false;
  return null;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
