import { bankTransactionSchema, invoiceSchema } from "../domain/import-schemas";
import type { BankTransaction, Invoice, MatchProposal } from "../domain/types";
import {
  addInvoices,
  addTransactions,
  approveReconciliation,
  logActivity,
  rejectProposal,
  undoReconciliation,
  type ApprovalRequest,
} from "./actions";
import { CURRENT_REVIEWER, reconcileStore } from "./store";

const now = () => new Date().toISOString();

/** Throws ReconcileError when invalid; state is unchanged in that case. */
export function approve(req: ApprovalRequest) {
  const next = approveReconciliation(reconcileStore.get(), req, CURRENT_REVIEWER, now());
  reconcileStore.set(() => next);
}

export function approveMany(reqs: ApprovalRequest[]) {
  let s = reconcileStore.get();
  for (const r of reqs) s = approveReconciliation(s, r, CURRENT_REVIEWER, now());
  reconcileStore.set(() => s);
}

export function undo(reconciliationId: string) {
  const next = undoReconciliation(reconcileStore.get(), reconciliationId, CURRENT_REVIEWER, now());
  reconcileStore.set(() => next);
}

export function reject(p: MatchProposal) {
  reconcileStore.set((s) => rejectProposal(s, p, CURRENT_REVIEWER, now()));
}

export function importTransactions(items: BankTransaction[]) {
  const r = addTransactions(reconcileStore.get(), items, bankTransactionSchema.duplicateKey, now());
  reconcileStore.set(() => r.state);
  return { added: r.added, skipped: r.skipped };
}

export function importInvoices(items: Invoice[]) {
  const r = addInvoices(reconcileStore.get(), items, invoiceSchema.duplicateKey, now());
  reconcileStore.set(() => r.state);
  return { added: r.added, skipped: r.skipped };
}

export function recordExport(message: string) {
  reconcileStore.set((s) => logActivity(s, { kind: "export", message }, now()));
}
