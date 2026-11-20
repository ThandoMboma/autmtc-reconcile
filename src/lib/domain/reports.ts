import { centsToDecimal, formatZAR } from "./money";
import { daysBetween } from "./dates";
import { invoiceStatus, INVOICE_STATUS_LABEL } from "./invoice-status";
import { MATCH_KIND_LABEL, type MatchingResult } from "./matching";
import type { BankTransaction, Invoice, IsoDate, Reconciliation } from "./types";

export interface WorkspaceData {
  transactions: BankTransaction[];
  invoices: Invoice[];
  reconciliations: Reconciliation[];
}

export function summarise(d: WorkspaceData, analysis: MatchingResult, today: IsoDate) {
  const incoming = d.transactions.filter((t) => t.amount > 0);
  const outgoing = d.transactions.filter((t) => t.amount < 0);
  const txnById = new Map(d.transactions.map((t) => [t.id, t]));
  const matchedValue = d.reconciliations.reduce((s, r) => s + (txnById.get(r.transactionId)?.amount ?? 0), 0);
  const open = d.invoices.filter((i) => i.outstanding > 0);
  const overdue = open.filter((i) => invoiceStatus(i, today) === "overdue" || (i.dueDate < today && i.outstanding > 0));
  const suggestions = analysis.pending.map((t) => analysis.byTransaction.get(t.id)?.best).filter(Boolean);
  return {
    receiptsTotal: incoming.reduce((s, t) => s + t.amount, 0),
    receiptsCount: incoming.length,
    paymentsTotal: outgoing.reduce((s, t) => s + t.amount, 0),
    paymentsCount: outgoing.length,
    matchedCount: d.reconciliations.length,
    matchedValue,
    unmatchedCount: analysis.pending.length,
    unmatchedValue: analysis.pending.reduce((s, t) => s + t.amount, 0),
    awaitingCount: open.length,
    awaitingValue: open.reduce((s, i) => s + i.outstanding, 0),
    overdueCount: overdue.length,
    overdueValue: overdue.reduce((s, i) => s + i.outstanding, 0),
    suggestionCount: suggestions.length,
    highConfidenceCount: suggestions.filter((p) => p!.confidence >= 90 && !p!.flags.length).length,
    flaggedCount: suggestions.filter((p) => p!.flags.some((f) => f !== "low_confidence")).length,
    matchRate: incoming.length ? d.reconciliations.length / incoming.length : 0,
  };
}

export function matchedRows(d: WorkspaceData) {
  const txnById = new Map(d.transactions.map((t) => [t.id, t]));
  const invById = new Map(d.invoices.map((i) => [i.id, i]));
  return d.reconciliations
    .map((r) => {
      const t = txnById.get(r.transactionId);
      const invs = r.allocations.map((a) => ({ ...a, invoice: invById.get(a.invoiceId) }));
      return { rec: r, txn: t, invoices: invs };
    })
    .filter((r) => r.txn)
    .sort((a, b) => b.txn!.date.localeCompare(a.txn!.date));
}

export function agingBucket(inv: Invoice, today: IsoDate) {
  const days = daysBetween(inv.dueDate, today);
  if (days <= 0) return "Not yet due";
  if (days <= 30) return "1–30 days";
  if (days <= 60) return "31–60 days";
  if (days <= 90) return "61–90 days";
  return "90+ days";
}

export const AGING_BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;

export function unpaidInvoices(d: WorkspaceData, today: IsoDate) {
  return d.invoices
    .filter((i) => i.outstanding > 0)
    .map((i) => ({ invoice: i, status: invoiceStatus(i, today), daysOverdue: Math.max(0, daysBetween(i.dueDate, today)), bucket: agingBucket(i, today) }))
    .sort((a, b) => a.invoice.dueDate.localeCompare(b.invoice.dueDate));
}

export function buildReconciliationReportCsv(d: WorkspaceData, analysis: MatchingResult, today: IsoDate, company: string): (string | number)[][] {
  const s = summarise(d, analysis, today);
  const rows: (string | number)[][] = [
    ["AUTMTC Reconcile — Reconciliation report"],
    ["Company", company],
    ["Generated", new Date().toISOString()],
    ["Currency", "ZAR"],
    ["Note", "Demo workspace with fictional data. Report reflects reviewer-approved matches only."],
    [],
    ["SUMMARY"],
    ["Total bank receipts", centsToDecimal(s.receiptsTotal), `${s.receiptsCount} receipts`],
    ["Matched (approved)", centsToDecimal(s.matchedValue), `${s.matchedCount} receipts`],
    ["Unmatched receipts", centsToDecimal(s.unmatchedValue), `${s.unmatchedCount} receipts`],
    ["Invoices awaiting payment", centsToDecimal(s.awaitingValue), `${s.awaitingCount} invoices`],
    ["Overdue invoices", centsToDecimal(s.overdueValue), `${s.overdueCount} invoices`],
    [],
    ["MATCHED PAYMENTS"],
    ["Bank date", "Description", "Reference", "Receipt amount", "Invoice", "Customer", "Allocated", "Unallocated", "Match type", "Confidence", "Approved by", "Approved at"],
  ];
  for (const m of matchedRows(d)) {
    m.invoices.forEach((a, idx) => {
      rows.push([
        m.txn!.date, m.txn!.description, m.txn!.reference, idx === 0 ? centsToDecimal(m.txn!.amount) : "",
        a.invoice?.invoiceNumber ?? "", a.invoice?.customer ?? "", centsToDecimal(a.amount),
        idx === 0 ? centsToDecimal(m.rec.unallocated) : "", MATCH_KIND_LABEL[m.rec.kind],
        m.rec.confidence ?? "manual", m.rec.approvedBy, m.rec.approvedAt,
      ]);
    });
  }
  rows.push([], ["UNMATCHED RECEIPTS"], ["Bank date", "Description", "Reference", "Amount", "Suggested match", "Confidence", "Notes"]);
  for (const t of analysis.pending) {
    const a = analysis.byTransaction.get(t.id);
    rows.push([
      t.date, t.description, t.reference, centsToDecimal(t.amount),
      a?.best ? MATCH_KIND_LABEL[a.best.kind] : "None",
      a?.best?.confidence ?? "",
      a?.best ? a.best.reasons.join(" ") : (a?.notes ?? []).join(" "),
    ]);
  }
  rows.push([], ["UNPAID INVOICES"], ["Invoice", "Customer", "Invoice date", "Due date", "Invoice total", "Outstanding", "Status", "Days overdue", "Aging"]);
  for (const u of unpaidInvoices(d, today)) {
    rows.push([
      u.invoice.invoiceNumber, u.invoice.customer, u.invoice.invoiceDate, u.invoice.dueDate,
      centsToDecimal(u.invoice.amount), centsToDecimal(u.invoice.outstanding), INVOICE_STATUS_LABEL[u.status], u.daysOverdue, u.bucket,
    ]);
  }
  return rows;
}

export { formatZAR };
