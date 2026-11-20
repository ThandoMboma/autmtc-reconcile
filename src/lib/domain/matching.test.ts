import { describe, expect, it } from "vitest";
import { analyseTransactions } from "./matching";
import { createSampleState } from "../data/sample-data";
import { approveReconciliation, ReconcileError } from "../store/actions";

function run() {
  const s = createSampleState();
  const result = analyseTransactions({
    transactions: s.transactions,
    invoices: s.invoices,
    reconciledTransactionIds: new Set(s.reconciliations.map((r) => r.transactionId)),
  });
  const best = (id: string) => result.byTransaction.get(id)?.best ?? null;
  return { s, result, best };
}

describe("matching engine", () => {
  it("ranks invoice reference + exact amount as a high-confidence exact match", () => {
    const p = run().best("txn-101");
    expect(p?.kind).toBe("exact");
    expect(p?.allocations).toEqual([{ invoiceId: "inv-0141", amount: 1845000 }]);
    expect(p!.confidence).toBeGreaterThanOrEqual(90);
  });

  it("identifies a partial payment and leaves the balance owing", () => {
    const p = run().best("txn-103");
    expect(p?.kind).toBe("partial");
    expect(p?.allocations).toEqual([{ invoiceId: "inv-0145", amount: 2000000 }]);
  });

  it("identifies one payment covering two referenced invoices", () => {
    const p = run().best("txn-104");
    expect(p?.kind).toBe("combined");
    expect(p?.allocations.map((a) => a.invoiceId).sort()).toEqual(["inv-0146", "inv-0147"]);
  });

  it("finds a combined payment from the customer name when no invoice numbers are quoted", () => {
    const p = run().best("txn-107");
    expect(p?.kind).toBe("combined");
    expect(p?.allocations.map((a) => a.invoiceId).sort()).toEqual(["inv-0150", "inv-0151"]);
  });

  it("flags the second identical receipt within 3 days as a possible duplicate", () => {
    const { best } = run();
    expect(best("txn-105")?.flags).not.toContain("duplicate");
    expect(best("txn-106")?.flags).toContain("duplicate");
    expect(best("txn-106")!.confidence).toBeLessThanOrEqual(30);
  });

  it("flags an amount shared by two invoices with no reference as ambiguous", () => {
    const p = run().best("txn-108");
    expect(p?.flags).toContain("ambiguous");
    expect(p!.confidence).toBeLessThan(70);
  });

  it("flags overpayments and keeps the surplus unallocated", () => {
    const p = run().best("txn-111");
    expect(p?.kind).toBe("overpayment");
    expect(p?.unallocated).toBe(36000);
  });

  it("leaves receipts with no plausible invoice unmatched", () => {
    const { best } = run();
    expect(best("txn-110")).toBeNull();
    expect(best("txn-112")).toBeNull();
  });

  it("never proposes outgoing payments", () => {
    expect(run().result.byTransaction.has("txn-010")).toBe(false);
  });

  it("does not change any invoice balance by itself (approval is required)", () => {
    const { s } = run();
    expect(s.invoices.find((i) => i.id === "inv-0141")?.outstanding).toBe(1845000);
  });
});

describe("approval", () => {
  it("reduces the invoice balance only after approval", () => {
    const { s, best } = run();
    const p = best("txn-103")!;
    const next = approveReconciliation(s, { transactionId: p.transactionId, allocations: p.allocations, kind: p.kind, confidence: p.confidence, reasons: p.reasons }, "Tester", "2026-11-20T10:00:00Z");
    expect(next.invoices.find((i) => i.id === "inv-0145")?.outstanding).toBe(2800000);
    expect(next.reconciliations).toHaveLength(s.reconciliations.length + 1);
  });

  it("refuses to allocate more than an invoice's outstanding balance", () => {
    const { s } = run();
    expect(() =>
      approveReconciliation(s, { transactionId: "txn-111", allocations: [{ invoiceId: "inv-0156", amount: 900000 }], kind: "manual", confidence: null, reasons: [] }, "Tester", "2026-11-20T10:00:00Z"),
    ).toThrow(ReconcileError);
  });

  it("refuses to reconcile the same transaction twice", () => {
    const { s } = run();
    expect(() =>
      approveReconciliation(s, { transactionId: "txn-001", allocations: [{ invoiceId: "inv-0141", amount: 100 }], kind: "manual", confidence: null, reasons: [] }, "Tester", "2026-11-20T10:00:00Z"),
    ).toThrow(ReconcileError);
  });
});
