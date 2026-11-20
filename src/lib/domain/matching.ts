/**
 * Reconciliation matching engine.
 *
 * Pure and side-effect free: it only PROPOSES matches. Nothing is reconciled
 * until a person approves a proposal (see store/actions.ts → approveReconciliation).
 *
 * Priority order:
 *  1. Invoice reference found in the bank reference/description + exact amount
 *  2. Several referenced invoices whose outstanding totals equal the payment (combined)
 *  3. Referenced invoice with a smaller payment (partial) or larger payment (overpayment)
 *  4. Exact amount + customer name in the narrative
 *  5. Customer's open invoices that add up exactly to the payment (combined, no reference)
 *  6. Exact amount only (weak; flagged ambiguous when several invoices share the amount)
 */
import { daysBetween, formatDate } from "./dates";
import { formatZAR } from "./money";
import type {
  BankTransaction,
  Invoice,
  MatchFlag,
  MatchKind,
  MatchProposal,
  TransactionAnalysis,
} from "./types";

export interface MatchingInput {
  transactions: BankTransaction[];
  invoices: Invoice[];
  reconciledTransactionIds: ReadonlySet<string>;
  rejectedSignatures?: ReadonlySet<string>;
}

export interface MatchingResult {
  byTransaction: Map<string, TransactionAnalysis & { notes: string[] }>;
  /** Unreconciled incoming transactions, in date order. */
  pending: BankTransaction[];
}

const DUPLICATE_WINDOW_DAYS = 3;
const STOP_WORDS = new Set(["PTY", "LTD", "CC", "THE", "AND", "INC", "CO", "NPC", "SA", "OF", "TRADING", "GROUP", "SERVICES"]);

export const confidenceBand = (c: number) => (c >= 90 ? "high" : c >= 70 ? "medium" : "low");

const upper = (s: string) => s.toUpperCase();
const alnum = (s: string) => upper(s).replace(/[^A-Z0-9]/g, "");
const tokens = (s: string) => upper(s).split(/[^A-Z0-9]+/).filter(Boolean);

function narrative(t: BankTransaction) {
  return `${t.reference} ${t.description}`;
}

/** "strong" = full invoice number present; "partial" = its numeric tail appears as a token. */
export function referenceStrength(invoiceNumber: string, text: string): "strong" | "partial" | null {
  const key = alnum(invoiceNumber);
  if (key.length >= 4 && alnum(text).includes(key)) return "strong";
  const digitGroups = invoiceNumber.match(/\d+/g);
  const tail = digitGroups?.[digitGroups.length - 1];
  if (!tail || tail.length < 3) return null;
  const tailNoZeros = tail.replace(/^0+/, "");
  for (const tok of tokens(text)) {
    const t = tok.replace(/^INV(OICE)?/, "");
    if (t === tail || (tailNoZeros.length >= 3 && t === tailNoZeros)) return "partial";
  }
  return null;
}

/** True when the customer's distinctive name words appear in the bank narrative. */
export function customerMentioned(customer: string, text: string): boolean {
  const words = tokens(customer).filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
  if (!words.length) return false;
  const textTokens = tokens(text);
  const hit = (w: string) => textTokens.some((t) => t === w || (t.length >= 4 && w.startsWith(t)) || (w.length >= 4 && t.startsWith(w)));
  const hits = words.filter(hit).length;
  return hit(words[0]!) ? true : hits / words.length >= 0.5;
}

function signature(transactionId: string, kind: MatchKind, invoiceIds: string[]) {
  return `${transactionId}:${kind}:${[...invoiceIds].sort().join("+")}`;
}

function proposal(
  t: BankTransaction,
  kind: MatchKind,
  allocations: { invoice: Invoice; amount: number }[],
  confidence: number,
  reasons: string[],
  flags: MatchFlag[] = [],
): MatchProposal {
  const allocated = allocations.reduce((s, a) => s + a.amount, 0);
  return {
    signature: signature(t.id, kind, allocations.map((a) => a.invoice.id)),
    transactionId: t.id,
    kind,
    allocations: allocations.map((a) => ({ invoiceId: a.invoice.id, amount: a.amount })),
    unallocated: t.amount - allocated,
    confidence,
    reasons,
    flags,
  };
}

/** Finds the smallest subset (size ≥ 2) of invoices whose outstanding equals target. Oldest first on ties. */
function findCombination(invoices: Invoice[], target: number): Invoice[] | null {
  const list = [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 12);
  for (let size = 2; size <= Math.min(5, list.length); size++) {
    const pick: Invoice[] = [];
    const search = (start: number, remaining: number): boolean => {
      if (pick.length === size) return remaining === 0;
      for (let i = start; i < list.length; i++) {
        const inv = list[i]!;
        if (inv.outstanding > remaining) continue;
        pick.push(inv);
        if (search(i + 1, remaining - inv.outstanding)) return true;
        pick.pop();
      }
      return false;
    };
    if (search(0, target)) return [...pick];
  }
  return null;
}

function allocateOldestFirst(invoices: Invoice[], amount: number) {
  let left = amount;
  const out: { invoice: Invoice; amount: number }[] = [];
  for (const inv of [...invoices].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    if (left <= 0) break;
    const take = Math.min(left, inv.outstanding);
    out.push({ invoice: inv, amount: take });
    left -= take;
  }
  return out;
}

function candidatesFor(t: BankTransaction, open: Invoice[]): MatchProposal[] {
  const text = narrative(t);
  const out: MatchProposal[] = [];
  const refs = open
    .map((inv) => ({ inv, strength: referenceStrength(inv.invoiceNumber, text) }))
    .filter((r): r is { inv: Invoice; strength: "strong" | "partial" } => r.strength !== null);
  const refIds = new Set(refs.map((r) => r.inv.id));

  // Combined via several references
  if (refs.length >= 2) {
    const invs = refs.map((r) => r.inv);
    const total = invs.reduce((s, i) => s + i.outstanding, 0);
    const nums = invs.map((i) => i.invoiceNumber).join(", ");
    const strong = refs.every((r) => r.strength === "strong");
    if (total === t.amount) {
      out.push(
        proposal(t, "combined", invs.map((i) => ({ invoice: i, amount: i.outstanding })), strong ? 96 : 92, [
          `Reference quotes ${invs.length} invoices: ${nums}.`,
          `Their combined outstanding of ${formatZAR(total)} equals the payment exactly.`,
        ]),
      );
    } else if (total > t.amount) {
      out.push(
        proposal(t, "combined", allocateOldestFirst(invs, t.amount), 68, [
          `Reference quotes ${invs.length} invoices: ${nums}.`,
          `Payment of ${formatZAR(t.amount)} is less than their combined ${formatZAR(total)}; allocated to the oldest due first.`,
        ], ["low_confidence"]),
      );
    }
  }

  // Single referenced invoice
  for (const { inv, strength } of refs) {
    const refReason =
      strength === "strong"
        ? `Invoice number ${inv.invoiceNumber} appears in the bank reference.`
        : `Invoice digits from ${inv.invoiceNumber} appear in the bank reference.`;
    const custReason = customerMentioned(inv.customer, text) ? [`Payer narrative matches customer ${inv.customer}.`] : [];
    const bonus = custReason.length ? 2 : 0;
    if (t.amount === inv.outstanding) {
      out.push(
        proposal(t, "exact", [{ invoice: inv, amount: inv.outstanding }], (strength === "strong" ? 97 : 92) + bonus, [
          refReason,
          `Amount ${formatZAR(t.amount)} equals the outstanding balance exactly.`,
          ...custReason,
        ]),
      );
    } else if (t.amount < inv.outstanding) {
      const pct = Math.round((t.amount / inv.outstanding) * 100);
      out.push(
        proposal(t, "partial", [{ invoice: inv, amount: t.amount }], (strength === "strong" ? 80 : 72) + bonus, [
          refReason,
          `Partial payment: covers ${pct}% of the ${formatZAR(inv.outstanding)} outstanding.`,
          `${formatZAR(inv.outstanding - t.amount)} would remain owing on ${inv.invoiceNumber}.`,
          ...custReason,
        ]),
      );
    } else {
      out.push(
        proposal(t, "overpayment", [{ invoice: inv, amount: inv.outstanding }], 60 + bonus, [
          refReason,
          `Payment exceeds the outstanding ${formatZAR(inv.outstanding)} by ${formatZAR(t.amount - inv.outstanding)}.`,
          "The surplus stays unallocated — confirm with the customer before approving.",
          ...custReason,
        ], ["overpayment"]),
      );
    }
  }

  // Exact amount without a reference
  const sameAmount = open.filter((i) => !refIds.has(i.id) && i.outstanding === t.amount);
  for (const inv of sameAmount) {
    const cust = customerMentioned(inv.customer, text);
    out.push(
      cust
        ? proposal(t, "amount_customer", [{ invoice: inv, amount: inv.outstanding }], 86, [
            `Amount ${formatZAR(t.amount)} equals the outstanding balance of ${inv.invoiceNumber}.`,
            `Payer narrative matches customer ${inv.customer}.`,
            "No invoice number was quoted in the reference.",
          ])
        : proposal(t, "amount_only", [{ invoice: inv, amount: inv.outstanding }], 58, [
            `Amount ${formatZAR(t.amount)} equals the outstanding balance of ${inv.invoiceNumber} (${inv.customer}).`,
            "Neither the invoice number nor the customer name appears in the bank narrative.",
          ], ["low_confidence"]),
    );
  }

  // Combination of one customer's open invoices (no references)
  if (!out.some((p) => p.confidence >= 85)) {
    const byCustomer = new Map<string, Invoice[]>();
    for (const inv of open) {
      if (!customerMentioned(inv.customer, text)) continue;
      byCustomer.set(inv.customer, [...(byCustomer.get(inv.customer) ?? []), inv]);
    }
    for (const [customer, invs] of byCustomer) {
      const combo = findCombination(invs, t.amount);
      if (combo) {
        out.push(
          proposal(t, "combined", combo.map((i) => ({ invoice: i, amount: i.outstanding })), 80, [
            `Payer narrative matches customer ${customer}.`,
            `${combo.length} open invoices (${combo.map((i) => i.invoiceNumber).join(", ")}) add up to ${formatZAR(t.amount)} exactly.`,
            "No invoice numbers were quoted — confirm with the remittance advice.",
          ]),
        );
      }
    }
  }
  return out;
}

export function analyseTransactions(input: MatchingInput): MatchingResult {
  const rejected = input.rejectedSignatures ?? new Set<string>();
  const incomingAll = input.transactions
    .filter((t) => t.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const pending = incomingAll.filter((t) => !input.reconciledTransactionIds.has(t.id));
  const open = input.invoices.filter((i) => i.outstanding > 0);
  const byTransaction: MatchingResult["byTransaction"] = new Map();

  // Duplicate detection across all incoming (an earlier, already reconciled twin still counts).
  const duplicateOf = new Map<string, BankTransaction>();
  for (let j = 0; j < incomingAll.length; j++) {
    const b = incomingAll[j]!;
    for (let i = 0; i < j; i++) {
      const a = incomingAll[i]!;
      if (
        a.amount === b.amount &&
        Math.abs(daysBetween(a.date, b.date)) <= DUPLICATE_WINDOW_DAYS &&
        alnum(narrative(a)) === alnum(narrative(b))
      ) {
        duplicateOf.set(b.id, a);
        break;
      }
    }
  }

  for (const t of pending) {
    const notes: string[] = [];
    const twin = duplicateOf.get(t.id);
    let cands = candidatesFor(t, open).filter((p) => !rejected.has(p.signature));
    cands.sort((a, b) => b.confidence - a.confidence);

    const [top, runnerUp] = cands;
    if (top && runnerUp && top.confidence - runnerUp.confidence <= 5) {
      const tied = cands.filter((c) => top.confidence - c.confidence <= 5);
      for (const c of tied) {
        c.flags.push("ambiguous");
        c.reasons.push(`${tied.length} candidate matches score almost equally — choose the correct invoice.`);
        c.confidence -= 18;
      }
    }
    const first = cands[0];
    if (twin && first) {
      first.flags.push("duplicate");
      first.reasons.unshift(
        `Possible duplicate: same amount and reference as the receipt on ${formatDate(twin.date)}.`,
      );
      first.confidence = Math.min(first.confidence, 30);
    }
    if (twin && !first) notes.push(`Possible duplicate of the ${formatZAR(t.amount)} receipt on ${formatDate(twin.date)}.`);

    if (!first) {
      const paidRef = input.invoices.find((i) => i.outstanding <= 0 && referenceStrength(i.invoiceNumber, narrative(t)) === "strong");
      if (paidRef) notes.push(`Reference quotes ${paidRef.invoiceNumber}, which is already fully paid.`);
      if (!notes.length) notes.push("No open invoice is referenced or matches this amount.");
    }

    cands = cands.sort((a, b) => b.confidence - a.confidence);
    byTransaction.set(t.id, {
      transactionId: t.id,
      best: cands[0] ?? null,
      alternatives: cands.slice(1),
      duplicateOf: twin?.id,
      notes,
    });
  }

  // Conflicts: two receipts proposing more than an invoice's outstanding balance.
  const claims = new Map<string, { txnId: string; amount: number; confidence: number; date: string }[]>();
  for (const t of pending) {
    const best = byTransaction.get(t.id)?.best;
    if (!best) continue;
    for (const a of best.allocations) {
      claims.set(a.invoiceId, [...(claims.get(a.invoiceId) ?? []), { txnId: t.id, amount: a.amount, confidence: best.confidence, date: t.date }]);
    }
  }
  const invoiceById = new Map(input.invoices.map((i) => [i.id, i]));
  for (const [invoiceId, list] of claims) {
    const inv = invoiceById.get(invoiceId)!;
    if (list.length < 2 || list.reduce((s, c) => s + c.amount, 0) <= inv.outstanding) continue;
    const ranked = [...list].sort((a, b) => b.confidence - a.confidence || a.date.localeCompare(b.date));
    const winner = ranked[0]!;
    for (const c of ranked.slice(1)) {
      const best = byTransaction.get(c.txnId)!.best!;
      if (!best.flags.includes("conflict")) {
        best.flags.push("conflict");
        best.reasons.push(`${inv.invoiceNumber} is also proposed for the receipt on ${formatDate(winner.date)}; approving both would over-settle it.`);
        best.confidence = Math.max(5, best.confidence - 25);
      }
    }
  }

  for (const a of byTransaction.values()) {
    for (const p of [a.best, ...a.alternatives]) {
      if (!p) continue;
      p.confidence = Math.max(0, Math.min(100, p.confidence));
      if (p.confidence < 60 && !p.flags.includes("low_confidence")) p.flags.push("low_confidence");
    }
  }

  return { byTransaction, pending };
}

export const MATCH_KIND_LABEL: Record<MatchKind | "manual", string> = {
  exact: "Exact match",
  reference: "Reference match",
  partial: "Partial payment",
  combined: "Combined payment",
  amount_customer: "Amount + customer",
  amount_only: "Amount only",
  overpayment: "Overpayment",
  manual: "Manual match",
};

export const MATCH_FLAG_LABEL: Record<MatchFlag, string> = {
  duplicate: "Possible duplicate",
  ambiguous: "Ambiguous",
  conflict: "Conflict",
  overpayment: "Overpayment",
  low_confidence: "Low confidence",
};
