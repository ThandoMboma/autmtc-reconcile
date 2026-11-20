import { parseAmount } from "./money";
import { parseDate } from "./dates";
import type { BankTransaction, Invoice } from "./types";

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
  hint?: string;
  /** Lower-case header names that auto-map to this field. */
  aliases: string[];
}

export interface ImportSchema<T> {
  id: "transactions" | "invoices";
  title: string;
  fields: ImportField[];
  /** Extra mapping rule beyond per-field `required`. */
  validateMapping?: (mapped: Record<string, number>) => string | null;
  validate: (values: Record<string, string>) => string[];
  build: (values: Record<string, string>, batchId: string, index: number) => T;
  /** Natural key used to skip rows that already exist. */
  duplicateKey: (item: T) => string;
  template: string[][];
}

const has = (v: string | undefined) => v != null && v.trim() !== "";

export const bankTransactionSchema: ImportSchema<BankTransaction> = {
  id: "transactions",
  title: "Import bank statement",
  fields: [
    { key: "date", label: "Date", required: true, aliases: ["date", "transaction date", "posting date", "value date", "trans date"] },
    { key: "description", label: "Description", required: true, aliases: ["description", "narrative", "details", "transaction description", "memo"] },
    { key: "reference", label: "Reference", required: false, aliases: ["reference", "ref", "payment reference", "beneficiary reference", "their reference"] },
    { key: "amount", label: "Amount (signed)", required: false, hint: "Positive = money in, negative = money out", aliases: ["amount", "value", "transaction amount", "amount (zar)"] },
    { key: "credit", label: "Money in (credit)", required: false, hint: "Use instead of a signed amount", aliases: ["credit", "credits", "money in", "deposit", "paid in", "cr"] },
    { key: "debit", label: "Money out (debit)", required: false, hint: "Use instead of a signed amount", aliases: ["debit", "debits", "money out", "withdrawal", "paid out", "dr"] },
  ],
  validateMapping: (m) =>
    m["amount"] != null || m["credit"] != null || m["debit"] != null
      ? null
      : "Map either a signed Amount column, or Money in / Money out columns.",
  validate: (v) => {
    const errors: string[] = [];
    const d = parseDate(v["date"]);
    if (!d.ok) errors.push(`Date: ${d.error}`);
    if (!has(v["description"])) errors.push("Description is required.");
    const r = resolveBankAmount(v);
    if (!r.ok) errors.push(`Amount: ${r.error}`);
    else if (r.value === 0) errors.push("Amount: zero-value transactions are not imported.");
    return errors;
  },
  build: (v, batchId, i) => {
    const d = parseDate(v["date"]);
    const r = resolveBankAmount(v);
    return {
      id: `txn-${batchId}-${i}`,
      date: d.ok ? d.value : "",
      description: (v["description"] ?? "").trim(),
      reference: (v["reference"] ?? "").trim(),
      amount: r.ok ? r.value : 0,
      source: "csv",
      importBatchId: batchId,
    };
  },
  duplicateKey: (t) => `${t.date}|${t.amount}|${t.reference.toUpperCase()}|${t.description.toUpperCase()}`,
  template: [
    ["Date", "Description", "Reference", "Amount"],
    ["2026-11-18", "ACME TRADING PTY LTD", "INV-2026-0200", "12500.00"],
    ["19/11/2026", "MONTHLY SERVICE FEE", "FEE NOV", "-185.00"],
  ],
};

export function resolveBankAmount(v: Record<string, string>) {
  if (has(v["amount"])) return parseAmount(v["amount"]);
  const credit = has(v["credit"]) ? parseAmount(v["credit"]) : null;
  const debit = has(v["debit"]) ? parseAmount(v["debit"]) : null;
  if (credit && !credit.ok) return credit;
  if (debit && !debit.ok) return debit;
  const c = credit?.ok ? Math.abs(credit.value) : 0;
  const d = debit?.ok ? Math.abs(debit.value) : 0;
  if (!credit && !debit) return { ok: false as const, error: "Amount is missing." };
  if (c && d) return { ok: false as const, error: "Row has both money in and money out." };
  return { ok: true as const, value: c - d };
}

export const invoiceSchema: ImportSchema<Invoice> = {
  id: "invoices",
  title: "Import invoice register",
  fields: [
    { key: "invoiceNumber", label: "Invoice number", required: true, aliases: ["invoice number", "invoice no", "invoice #", "invoice", "number", "inv no", "document number"] },
    { key: "customer", label: "Customer", required: true, aliases: ["customer", "customer name", "client", "debtor", "account name"] },
    { key: "invoiceDate", label: "Invoice date", required: true, aliases: ["invoice date", "date", "issue date", "document date"] },
    { key: "dueDate", label: "Due date", required: true, aliases: ["due date", "due", "payment due"] },
    { key: "amount", label: "Invoice total", required: true, aliases: ["total", "amount", "invoice total", "invoice amount", "gross"] },
    { key: "outstanding", label: "Outstanding amount", required: false, hint: "Defaults to invoice total", aliases: ["outstanding", "balance", "amount due", "outstanding amount", "balance due"] },
  ],
  validate: (v) => {
    const errors: string[] = [];
    if (!has(v["invoiceNumber"])) errors.push("Invoice number is required.");
    if (!has(v["customer"])) errors.push("Customer is required.");
    const id = parseDate(v["invoiceDate"]);
    const dd = parseDate(v["dueDate"]);
    if (!id.ok) errors.push(`Invoice date: ${id.error}`);
    if (!dd.ok) errors.push(`Due date: ${dd.error}`);
    if (id.ok && dd.ok && dd.value < id.value) errors.push("Due date is before the invoice date.");
    const amt = parseAmount(v["amount"]);
    if (!amt.ok) errors.push(`Invoice total: ${amt.error}`);
    else if (amt.value <= 0) errors.push("Invoice total must be greater than zero.");
    if (has(v["outstanding"])) {
      const out = parseAmount(v["outstanding"]);
      if (!out.ok) errors.push(`Outstanding: ${out.error}`);
      else if (out.value < 0) errors.push("Outstanding cannot be negative.");
      else if (amt.ok && out.value > amt.value) errors.push("Outstanding is greater than the invoice total.");
    }
    return errors;
  },
  build: (v, batchId, i) => {
    const amt = parseAmount(v["amount"]);
    const out = has(v["outstanding"]) ? parseAmount(v["outstanding"]) : amt;
    const id = parseDate(v["invoiceDate"]);
    const dd = parseDate(v["dueDate"]);
    return {
      id: `inv-${batchId}-${i}`,
      invoiceNumber: (v["invoiceNumber"] ?? "").trim(),
      customer: (v["customer"] ?? "").trim(),
      invoiceDate: id.ok ? id.value : "",
      dueDate: dd.ok ? dd.value : "",
      amount: amt.ok ? amt.value : 0,
      outstanding: out.ok ? out.value : 0,
      source: "csv",
    };
  },
  duplicateKey: (inv) => inv.invoiceNumber.toUpperCase().replace(/\s+/g, ""),
  template: [
    ["Invoice number", "Customer", "Invoice date", "Due date", "Total", "Outstanding"],
    ["INV-2026-0200", "Acme Trading (Pty) Ltd", "2026-11-01", "2026-12-01", "12500.00", "12500.00"],
  ],
};

/** Guesses a column for each field from header names. Each column is used at most once. */
export function guessMapping(header: string[], fields: ImportField[]): Record<string, number> {
  const used = new Set<number>();
  const result: Record<string, number> = {};
  const norm = header.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  for (const f of fields) {
    const idx = norm.findIndex((h, i) => !used.has(i) && f.aliases.includes(h));
    if (idx >= 0) {
      result[f.key] = idx;
      used.add(idx);
    }
  }
  return result;
}
