import type { Cents } from "./types";

const zar = new Intl.NumberFormat("en-ZA", {
  style: "currency",
  currency: "ZAR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Formats cents as "R 1 234,56" (en-ZA convention). */
export function formatZAR(cents: Cents, opts: { signed?: boolean | undefined } = {}): string {
  const formatted = zar.format(Math.abs(cents) / 100).replace(/\u00a0/g, " ");
  if (cents < 0) return `−${formatted}`;
  if (opts.signed && cents > 0) return `+${formatted}`;
  return formatted;
}

/** Plain decimal for CSV export: 1234.56 / -1234.56 */
export function centsToDecimal(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

const MAX_AMOUNT_CENTS = 100_000_000_000; // R 1 billion sanity ceiling

/**
 * Parses bank/accounting amount strings into signed cents.
 * Accepts: "1234.56", "1 234,56", "R1,234.56", "ZAR 1234", "(500.00)", "500.00-", "500.00 DR", "-500".
 * When both "," and "." appear, the last one is the decimal separator.
 */
export function parseAmount(raw: unknown): ParseResult<Cents> {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return { ok: false, error: "Amount is not a number." };
    return checkRange(Math.round(raw * 100));
  }
  if (typeof raw !== "string") return { ok: false, error: "Amount is missing." };
  let s = raw.trim().replace(/[\u00a0\u202f']/g, " ");
  if (!s) return { ok: false, error: "Amount is missing." };

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (/\b(DR|DT)$/i.test(s)) {
    negative = true;
    s = s.replace(/\b(DR|DT)$/i, "").trim();
  } else if (/\bCR$/i.test(s)) {
    s = s.replace(/\bCR$/i, "").trim();
  }
  if (s.endsWith("-")) {
    negative = true;
    s = s.slice(0, -1).trim();
  }
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  s = s.replace(/^(ZAR|R)\s*/i, "");
  if (s.startsWith("-") || s.startsWith("−")) {
    negative = !negative;
    s = s.slice(1).trim();
  }
  s = s.replace(/\s+/g, "");
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) {
    return { ok: false, error: `"${raw}" is not a valid amount.` };
  }

  const wellFormed = [/^\d+([.,]\d{1,3})?$/, /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/, /^\d{1,3}(\.\d{3})+(,\d{1,2})?$/];
  if (!wellFormed.some((re) => re.test(s))) {
    return { ok: false, error: `"${raw}" is not a valid amount.` };
  }
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimalSep = lastComma > lastDot ? "," : ".";
    const thousandSep = decimalSep === "," ? "." : ",";
    normalized = s.split(thousandSep).join("").replace(decimalSep, ".");
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const commaCount = s.split(",").length - 1;
    normalized = commaCount === 1 && decimals <= 2 ? s.replace(",", ".") : s.split(",").join("");
  } else {
    const dotCount = s.split(".").length - 1;
    const decimals = s.length - lastDot - 1;
    normalized = dotCount > 1 || (dotCount === 1 && decimals === 3 && s.length > 4) ? s.split(".").join("") : s;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return { ok: false, error: `"${raw}" has more than two decimal places or an invalid format.` };
  }
  const [whole = "0", frac = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, "0"));
  return checkRange(negative ? -cents : cents);
}

function checkRange(cents: number): ParseResult<Cents> {
  if (Math.abs(cents) > MAX_AMOUNT_CENTS) return { ok: false, error: "Amount exceeds R 1 000 000 000." };
  return { ok: true, value: cents };
}
