import type { IsoDate } from "./types";
import type { ParseResult } from "./money";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): ParseResult<IsoDate> {
  if (y < 1990 || y > 2100) return { ok: false, error: `Year ${y} is out of range.` };
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { ok: false, error: `${d}/${m}/${y} is not a real calendar date.` };
  }
  return { ok: true, value: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

/**
 * Parses common bank-statement date formats into ISO dates.
 * Numeric day-first formats (DD/MM/YYYY) follow South African convention.
 * Accepts: 2026-11-05, 2026/11/05, 05/11/2026, 05-11-2026, 5.11.2026, 05 Nov 2026, 5-Nov-26.
 */
export function parseDate(raw: unknown): ParseResult<IsoDate> {
  if (typeof raw !== "string" || !raw.trim()) return { ok: false, error: "Date is missing." };
  const s = raw.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-,]*(\d{2}|\d{4})$/);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase().slice(0, m[2]!.toLowerCase().startsWith("sept") ? 4 : 3)];
    if (!month) return { ok: false, error: `"${raw}" has an unknown month.` };
    const y = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return iso(y, month, Number(m[1]));
  }
  return { ok: false, error: `"${raw}" is not a recognised date. Use YYYY-MM-DD or DD/MM/YYYY.` };
}

export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

const display = new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
export function formatDate(d: IsoDate): string {
  return display.format(new Date(`${d}T00:00:00Z`));
}

const displayTime = new Intl.DateTimeFormat("en-ZA", {
  day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Africa/Johannesburg",
});
export function formatTimestamp(ts: string): string {
  return displayTime.format(new Date(ts));
}

/** Today's date in South Africa (SAST). */
export function todayIso(): IsoDate {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
}
