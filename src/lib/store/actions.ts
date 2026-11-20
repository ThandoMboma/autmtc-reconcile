/**
 * Pure state transitions. The UI store and a future database repository both
 * go through these, so business rules (no over-allocation, approval required) live in one place.
 */
import { formatZAR } from "../domain/money";
import { MATCH_KIND_LABEL } from "../domain/matching";
import type {
  ActivityEntry,
  Allocation,
  BankTransaction,
  Invoice,
  MatchKind,
  MatchProposal,
  Reconciliation,
} from "../domain/types";

export interface ReconcileState {
  version: 1;
  transactions: BankTransaction[];
  invoices: Invoice[];
  reconciliations: Reconciliation[];
  rejectedSignatures: string[];
  activity: ActivityEntry[];
}

export interface ApprovalRequest {
  transactionId: string;
  allocations: Allocation[];
  kind: MatchKind | "manual";
  confidence: number | null;
  reasons: string[];
  note?: string;
}

const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function log(state: ReconcileState, entry: Omit<ActivityEntry, "id" | "at">, now: string): ActivityEntry[] {
  return [{ id: uid("act"), at: now, ...entry }, ...state.activity].slice(0, 200);
}

export class ReconcileError extends Error {}

/** Records a human-approved match. Throws when the allocation is not valid against current balances. */
export function approveReconciliation(
  state: ReconcileState,
  req: ApprovalRequest,
  approvedBy: string,
  now: string,
): ReconcileState {
  const txn = state.transactions.find((t) => t.id === req.transactionId);
  if (!txn) throw new ReconcileError("Transaction not found.");
  if (txn.amount <= 0) throw new ReconcileError("Only incoming payments can be matched to invoices.");
  if (state.reconciliations.some((r) => r.transactionId === txn.id)) {
    throw new ReconcileError("This transaction is already reconciled.");
  }
  if (!req.allocations.length) throw new ReconcileError("Select at least one invoice.");
  const seen = new Set<string>();
  let total = 0;
  for (const a of req.allocations) {
    if (seen.has(a.invoiceId)) throw new ReconcileError("An invoice appears twice in the allocation.");
    seen.add(a.invoiceId);
    const inv = state.invoices.find((i) => i.id === a.invoiceId);
    if (!inv) throw new ReconcileError("Invoice not found.");
    if (!Number.isInteger(a.amount) || a.amount <= 0) throw new ReconcileError("Allocations must be positive amounts.");
    if (a.amount > inv.outstanding) {
      throw new ReconcileError(`${inv.invoiceNumber} only has ${formatZAR(inv.outstanding)} outstanding.`);
    }
    total += a.amount;
  }
  if (total > txn.amount) throw new ReconcileError("Allocations exceed the payment amount.");

  const rec: Reconciliation = {
    id: uid("rec"),
    transactionId: txn.id,
    allocations: req.allocations,
    unallocated: txn.amount - total,
    kind: req.kind,
    confidence: req.confidence,
    reasons: req.reasons,
    approvedAt: now,
    approvedBy,
    ...(req.note ? { note: req.note } : {}),
  };
  const alloc = new Map(req.allocations.map((a) => [a.invoiceId, a.amount]));
  const invoiceNumbers = state.invoices.filter((i) => alloc.has(i.id)).map((i) => i.invoiceNumber);
  return {
    ...state,
    invoices: state.invoices.map((i) => (alloc.has(i.id) ? { ...i, outstanding: i.outstanding - alloc.get(i.id)! } : i)),
    reconciliations: [rec, ...state.reconciliations],
    activity: log(state, {
      kind: "approve",
      message: `${approvedBy} approved ${MATCH_KIND_LABEL[req.kind].toLowerCase()}: ${txn.description} → ${invoiceNumbers.join(", ")}`,
      amount: total,
    }, now),
  };
}

export function undoReconciliation(state: ReconcileState, reconciliationId: string, by: string, now: string): ReconcileState {
  const rec = state.reconciliations.find((r) => r.id === reconciliationId);
  if (!rec) throw new ReconcileError("Reconciliation not found.");
  const alloc = new Map(rec.allocations.map((a) => [a.invoiceId, a.amount]));
  const txn = state.transactions.find((t) => t.id === rec.transactionId);
  return {
    ...state,
    invoices: state.invoices.map((i) =>
      alloc.has(i.id) ? { ...i, outstanding: Math.min(i.amount, i.outstanding + alloc.get(i.id)!) } : i,
    ),
    reconciliations: state.reconciliations.filter((r) => r.id !== reconciliationId),
    activity: log(state, { kind: "undo", message: `${by} reversed the match for ${txn?.description ?? "a receipt"}`, amount: txn?.amount }, now),
  };
}

export function rejectProposal(state: ReconcileState, p: MatchProposal, by: string, now: string): ReconcileState {
  const txn = state.transactions.find((t) => t.id === p.transactionId);
  return {
    ...state,
    rejectedSignatures: [...new Set([...state.rejectedSignatures, p.signature])],
    activity: log(state, { kind: "reject", message: `${by} rejected a suggested ${MATCH_KIND_LABEL[p.kind].toLowerCase()} for ${txn?.description ?? "a receipt"}` }, now),
  };
}

export function addTransactions(state: ReconcileState, items: BankTransaction[], key: (t: BankTransaction) => string, now: string) {
  const existing = new Set(state.transactions.map(key));
  const added: BankTransaction[] = [];
  let skipped = 0;
  for (const t of items) {
    const k = key(t);
    if (existing.has(k)) { skipped++; continue; }
    existing.add(k);
    added.push(t);
  }
  const next: ReconcileState = {
    ...state,
    transactions: [...added, ...state.transactions],
    activity: added.length
      ? log(state, { kind: "import_transactions", message: `Imported ${added.length} bank transaction${added.length === 1 ? "" : "s"} from CSV` }, now)
      : state.activity,
  };
  return { state: next, added: added.length, skipped };
}

export function addInvoices(state: ReconcileState, items: Invoice[], key: (i: Invoice) => string, now: string) {
  const existing = new Set(state.invoices.map(key));
  const added: Invoice[] = [];
  let skipped = 0;
  for (const i of items) {
    const k = key(i);
    if (existing.has(k)) { skipped++; continue; }
    existing.add(k);
    added.push(i);
  }
  const next: ReconcileState = {
    ...state,
    invoices: [...added, ...state.invoices],
    activity: added.length
      ? log(state, { kind: "import_invoices", message: `Imported ${added.length} invoice${added.length === 1 ? "" : "s"} from CSV` }, now)
      : state.activity,
  };
  return { state: next, added: added.length, skipped };
}

export function logActivity(state: ReconcileState, entry: Omit<ActivityEntry, "id" | "at">, now: string): ReconcileState {
  return { ...state, activity: log(state, entry, now) };
}
