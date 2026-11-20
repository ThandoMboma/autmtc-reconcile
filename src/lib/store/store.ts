import { useMemo, useSyncExternalStore } from "react";
import { createSampleState } from "../data/sample-data";
import { analyseTransactions } from "../domain/matching";
import { todayIso } from "../domain/dates";
import { activeRepository } from "./repository";
import type { ReconcileState } from "./actions";

/** Demo reviewer identity until sign-in is added. */
export const CURRENT_REVIEWER = "Finance Reviewer";

let state: ReconcileState = createSampleState();
const serverSnapshot = state;
const listeners = new Set<() => void>();
let hydrated = false;

function emit() {
  for (const l of listeners) l();
}

export const reconcileStore = {
  get: () => state,
  set(updater: (s: ReconcileState) => ReconcileState) {
    state = updater(state);
    emit();
    if (hydrated) void activeRepository.save(state);
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  async hydrate() {
    if (hydrated) return;
    hydrated = true;
    const saved = await activeRepository.load();
    if (saved) {
      state = saved;
      emit();
    }
  },
  async reset() {
    await activeRepository.clear();
    state = createSampleState();
    emit();
    void activeRepository.save(state);
  },
};

export function useReconcileState(): ReconcileState {
  return useSyncExternalStore(reconcileStore.subscribe, reconcileStore.get, () => serverSnapshot);
}

export function useToday() {
  return useMemo(() => todayIso(), []);
}

/** Derived matching analysis, recomputed when data changes. */
export function useAnalysis() {
  const s = useReconcileState();
  return useMemo(() => {
    const reconciledIds = new Set(s.reconciliations.map((r) => r.transactionId));
    return {
      ...analyseTransactions({
        transactions: s.transactions,
        invoices: s.invoices,
        reconciledTransactionIds: reconciledIds,
        rejectedSignatures: new Set(s.rejectedSignatures),
      }),
      reconciledIds,
    };
  }, [s.transactions, s.invoices, s.reconciliations, s.rejectedSignatures]);
}
