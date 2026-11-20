/**
 * Domain types for AUTMTC Reconcile.
 * All monetary values are integer cents (ZAR) to avoid floating-point drift.
 * All dates are ISO calendar dates (YYYY-MM-DD).
 * Shapes map 1:1 to future database tables (bank_transactions, invoices, reconciliations, activity_log).
 */

export type Cents = number;
export type IsoDate = string;

export type TransactionDirection = "incoming" | "outgoing";

export interface BankTransaction {
  id: string;
  date: IsoDate;
  description: string;
  reference: string;
  /** Signed: positive = money in, negative = money out. */
  amount: Cents;
  source: "sample" | "csv";
  importBatchId?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  customer: string;
  invoiceDate: IsoDate;
  dueDate: IsoDate;
  /** Invoice total. */
  amount: Cents;
  /** Amount still owed after approved reconciliations. */
  outstanding: Cents;
  source: "sample" | "csv";
}

export type InvoiceStatus = "open" | "overdue" | "partially_paid" | "paid";

export interface Allocation {
  invoiceId: string;
  amount: Cents;
}

export type MatchKind =
  | "exact" // reference + exact amount
  | "reference" // reference found, amount differs slightly / customer confirmed
  | "partial" // pays part of an invoice
  | "combined" // one payment settles several invoices
  | "amount_customer" // exact amount + customer name, no reference
  | "amount_only" // exact amount only
  | "overpayment"; // reference found, amount exceeds outstanding

export type MatchFlag = "duplicate" | "ambiguous" | "conflict" | "overpayment" | "low_confidence";

export interface MatchProposal {
  /** Stable signature: transaction + sorted invoice ids + kind. Used to remember rejections. */
  signature: string;
  transactionId: string;
  kind: MatchKind;
  allocations: Allocation[];
  /** Transaction amount not allocated to invoices (overpayment remainder). */
  unallocated: Cents;
  confidence: number; // 0-100
  reasons: string[];
  flags: MatchFlag[];
}

export interface TransactionAnalysis {
  transactionId: string;
  best: MatchProposal | null;
  alternatives: MatchProposal[];
  duplicateOf?: string;
}

export interface Reconciliation {
  id: string;
  transactionId: string;
  allocations: Allocation[];
  unallocated: Cents;
  kind: MatchKind | "manual";
  confidence: number | null;
  reasons: string[];
  approvedAt: string; // ISO timestamp
  approvedBy: string;
  note?: string;
}

export type ActivityKind =
  | "import_transactions"
  | "import_invoices"
  | "approve"
  | "reject"
  | "undo"
  | "reset"
  | "export";

export interface ActivityEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  message: string;
  amount?: Cents;
}
