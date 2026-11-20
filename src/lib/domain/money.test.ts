import { describe, expect, it } from "vitest";
import { parseAmount } from "./money";
import { parseDate } from "./dates";

const cents = (s: string) => {
  const r = parseAmount(s);
  return r.ok ? r.value : r.error;
};

describe("parseAmount", () => {
  it("reads South African and international formats as cents", () => {
    expect(cents("1 234,56")).toBe(123456);
    expect(cents("R1,234.56")).toBe(123456);
    expect(cents("ZAR 18450")).toBe(1845000);
    expect(cents("1.234,56")).toBe(123456);
  });
  it("treats brackets, trailing minus and DR as money out", () => {
    expect(cents("(500.00)")).toBe(-50000);
    expect(cents("500.00-")).toBe(-50000);
    expect(cents("500.00 DR")).toBe(-50000);
    expect(cents("-R 75,10")).toBe(-7510);
  });
  it("rejects text and more than two decimals", () => {
    expect(parseAmount("abc").ok).toBe(false);
    expect(parseAmount("12.345.6").ok).toBe(false);
    expect(parseAmount("").ok).toBe(false);
  });
});

describe("parseDate", () => {
  it("reads numeric dates day-first (DD/MM/YYYY)", () => {
    expect(parseDate("05/11/2026")).toEqual({ ok: true, value: "2026-11-05" });
    expect(parseDate("2026-11-05")).toEqual({ ok: true, value: "2026-11-05" });
    expect(parseDate("5 Nov 2026")).toEqual({ ok: true, value: "2026-11-05" });
  });
  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026").ok).toBe(false);
    expect(parseDate("2026-13-01").ok).toBe(false);
    expect(parseDate("next week").ok).toBe(false);
  });
});
