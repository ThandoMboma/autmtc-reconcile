/**
 * FICTIONAL demo data for "Meridian Supplies (Pty) Ltd".
 * All companies, references and amounts are invented. No real bank or accounting data.
 */
import type { BankTransaction, Invoice, Reconciliation, ActivityEntry } from "../domain/types";
import type { ReconcileState } from "../store/actions";

export const DEMO_COMPANY = "Meridian Supplies (Pty) Ltd";
export const DEMO_BANK_ACCOUNT = "Business Current · ••• 4471";

const R = (rand: number) => Math.round(rand * 100);

const inv = (n: string, customer: string, invoiceDate: string, dueDate: string, amount: number, outstanding = amount): Invoice => ({
  id: `inv-${n}`,
  invoiceNumber: `INV-2026-${n}`,
  customer,
  invoiceDate,
  dueDate,
  amount: R(amount),
  outstanding: R(outstanding),
  source: "sample",
});

export const sampleInvoices: Invoice[] = [
  // Previously settled (October / early November)
  inv("0136", "Garden Route Tours CC", "2026-09-28", "2026-10-28", 7420.0, 0),
  inv("0138", "Baobab Logistics (Pty) Ltd", "2026-10-02", "2026-11-01", 22150.0, 0),
  inv("0139", "Umhlanga Design Studio", "2026-10-06", "2026-11-05", 5600.0, 0),
  // Open register
  inv("0141", "Baobab Logistics (Pty) Ltd", "2026-10-14", "2026-11-13", 18450.0),
  inv("0143", "Table Bay Coffee Roasters", "2026-10-16", "2026-11-15", 6325.5),
  inv("0145", "Highveld Engineering Works", "2026-10-18", "2026-11-17", 48000.0),
  inv("0146", "Karoo Fresh Produce CC", "2026-10-20", "2026-11-19", 9230.0),
  inv("0147", "Karoo Fresh Produce CC", "2026-10-22", "2026-11-21", 6550.0),
  inv("0150", "Cape Vineyard Holdings", "2026-10-23", "2026-11-22", 12100.0),
  inv("0151", "Cape Vineyard Holdings", "2026-10-27", "2026-11-26", 15200.0),
  inv("0152", "Soweto Print House", "2026-10-28", "2026-11-27", 4980.0),
  inv("0153", "Umhlanga Design Studio", "2026-10-29", "2026-11-28", 3450.0),
  inv("0154", "Garden Route Tours CC", "2026-10-30", "2026-11-29", 3450.0),
  inv("0155", "Drakensberg Outdoor Co", "2026-10-31", "2026-11-30", 11875.0),
  inv("0156", "Limpopo Agri Supplies", "2026-11-02", "2026-12-02", 8640.0),
  inv("0157", "Highveld Engineering Works", "2026-09-15", "2026-10-15", 31200.0),
  inv("0158", "Table Bay Coffee Roasters", "2026-11-04", "2026-12-04", 2890.75),
  inv("0159", "Mpumalanga Timber Traders", "2026-09-22", "2026-10-22", 17650.0),
  inv("0160", "Baobab Logistics (Pty) Ltd", "2026-11-06", "2026-12-06", 26400.0),
  inv("0161", "Kalahari Solar Installations", "2026-11-09", "2026-12-09", 54300.0),
  inv("0162", "Cape Vineyard Holdings", "2026-11-11", "2026-12-11", 8925.0),
];

const tx = (id: string, date: string, description: string, reference: string, amount: number): BankTransaction => ({
  id: `txn-${id}`, date, description, reference, amount: R(amount), source: "sample",
});

export const sampleTransactions: BankTransaction[] = [
  // Already reconciled receipts
  tx("001", "2026-10-29", "GARDEN ROUTE TOURS", "INV-2026-0136", 7420.0),
  tx("002", "2026-11-02", "BAOBAB LOGISTICS PTY", "INV20260138", 22150.0),
  tx("003", "2026-11-04", "UMHLANGA DESIGN", "INV 0139", 5600.0),
  // Outgoing
  tx("004", "2026-11-01", "RENT - SILVERTON BUSINESS PARK", "NOV RENT", -38500.0),
  tx("005", "2026-11-03", "SARS VAT201 PAYMENT", "VAT OCT26", -24318.42),
  tx("006", "2026-11-05", "CITY OF TSHWANE MUNICIPAL", "ACC 5501882", -6214.9),
  tx("007", "2026-11-07", "SUPPLIER PAYMENT - NORTHWIND STEEL", "PO-8812", -41275.0),
  tx("008", "2026-11-10", "FUEL CARD SETTLEMENT", "FLEET NOV", -9840.55),
  tx("009", "2026-11-13", "MONTHLY ACCOUNT FEE", "FEE", -385.0),
  tx("010", "2026-11-15", "PAYROLL BATCH 11/2026", "SALARIES", -186420.0),
  // Pending incoming
  tx("101", "2026-11-09", "BAOBAB LOGISTICS PTY", "INV-2026-0141", 18450.0),
  tx("102", "2026-11-10", "TABLE BAY COFFEE", "TBCR INV20260143", 6325.5),
  tx("103", "2026-11-11", "HIGHVELD ENG WORKS", "INV-2026-0145 PART", 20000.0),
  tx("104", "2026-11-11", "KAROO FRESH PRODUCE", "INV 0146 0147", 15780.0),
  tx("105", "2026-11-12", "SOWETO PRINT HOUSE", "INV-2026-0152", 4980.0),
  tx("106", "2026-11-13", "SOWETO PRINT HOUSE", "INV-2026-0152", 4980.0),
  tx("107", "2026-11-14", "CAPE VINEYARD HOLD", "NOV ACCOUNT", 27300.0),
  tx("108", "2026-11-16", "EFT CREDIT ACB", "PAYMENT RECEIVED", 3450.0),
  tx("109", "2026-11-17", "DRAKENSBERG OUTDOOR", "PAYMENT", 11875.0),
  tx("110", "2026-11-17", "CASH DEPOSIT BRANCH 0412", "DEPOSIT", 2300.0),
  tx("111", "2026-11-18", "LIMPOPO AGRI SUP", "INV-2026-0156", 9000.0),
  tx("112", "2026-11-18", "CREDIT INTEREST", "INT NOV", 142.37),
  tx("113", "2026-11-19", "UMHLANGA DESIGN", "INV-2026-0139", 5600.0),
];

const seedRecs: Reconciliation[] = [
  { id: "rec-seed-1", transactionId: "txn-001", allocations: [{ invoiceId: "inv-0136", amount: R(7420) }], unallocated: 0, kind: "exact", confidence: 99, reasons: ["Invoice number INV-2026-0136 appears in the bank reference.", "Amount equals the outstanding balance exactly."], approvedAt: "2026-10-30T08:42:00.000Z", approvedBy: "N. Dlamini" },
  { id: "rec-seed-2", transactionId: "txn-002", allocations: [{ invoiceId: "inv-0138", amount: R(22150) }], unallocated: 0, kind: "exact", confidence: 97, reasons: ["Invoice number INV-2026-0138 appears in the bank reference.", "Amount equals the outstanding balance exactly."], approvedAt: "2026-11-03T07:15:00.000Z", approvedBy: "N. Dlamini" },
  { id: "rec-seed-3", transactionId: "txn-003", allocations: [{ invoiceId: "inv-0139", amount: R(5600) }], unallocated: 0, kind: "exact", confidence: 92, reasons: ["Invoice digits from INV-2026-0139 appear in the bank reference.", "Amount equals the outstanding balance exactly."], approvedAt: "2026-11-05T09:03:00.000Z", approvedBy: "J. van Wyk" },
];

const seedActivity: ActivityEntry[] = [
  { id: "act-seed-4", at: "2026-11-19T06:30:00.000Z", kind: "import_transactions", message: "Imported 13 bank transactions from CSV (statement 12–19 Nov)" },
  { id: "act-seed-3", at: "2026-11-11T13:20:00.000Z", kind: "import_invoices", message: "Imported 9 invoices from CSV (sales register)" },
  { id: "act-seed-2", at: "2026-11-05T09:03:00.000Z", kind: "approve", message: "J. van Wyk approved exact match: UMHLANGA DESIGN → INV-2026-0139", amount: R(5600) },
  { id: "act-seed-1", at: "2026-11-03T07:15:00.000Z", kind: "approve", message: "N. Dlamini approved exact match: BAOBAB LOGISTICS PTY → INV-2026-0138", amount: R(22150) },
];

export function createSampleState(): ReconcileState {
  return {
    version: 1,
    transactions: sampleTransactions.map((t) => ({ ...t })),
    invoices: sampleInvoices.map((i) => ({ ...i })),
    reconciliations: seedRecs.map((r) => ({ ...r, allocations: r.allocations.map((a) => ({ ...a })) })),
    rejectedSignatures: [],
    activity: seedActivity.map((a) => ({ ...a })),
  };
}
