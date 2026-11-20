import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, CircleDashed, Hand, RotateCcw, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Amount } from "@/components/app/Amount";
import { ApproveDialog } from "@/components/app/ApproveDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { ManualMatchDialog } from "@/components/app/ManualMatchDialog";
import { PageHeader } from "@/components/app/PageHeader";
import { ConfidenceMeter, FlagBadge, MatchKindBadge } from "@/components/app/StatusBadges";
import { Segmented, td, th } from "@/components/app/Toolbar";
import { Button } from "@/components/ui/button";
import { formatDate, formatTimestamp } from "@/lib/domain/dates";
import { MATCH_KIND_LABEL } from "@/lib/domain/matching";
import { formatZAR } from "@/lib/domain/money";
import type { Allocation, MatchProposal } from "@/lib/domain/types";
import { ReconcileError } from "@/lib/store/actions";
import { approve, approveMany, reject, undo } from "@/lib/store/commands";
import { useAnalysis, useReconcileState } from "@/lib/store/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reconciliation")({
  validateSearch: (s: Record<string, unknown>): { txn?: string | undefined } => ({
    txn: typeof s["txn"] === "string" ? s["txn"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Reconciliation — AUTMTC Reconcile" },
      { name: "description", content: "Review suggested matches between bank receipts and invoices, with confidence and explanations. Nothing is reconciled without approval." },
      { property: "og:title", content: "Reconciliation — AUTMTC Reconcile" },
      { property: "og:description", content: "Explainable bank-to-invoice match suggestions with reviewer approval." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReconciliationPage,
});

type Filter = "all" | "ready" | "attention" | "none";
const fail = (e: unknown) => { toast.error(e instanceof ReconcileError ? e.message : "Could not record this match."); return false; };

function ReconciliationPage() {
  const state = useReconcileState();
  const analysis = useAnalysis();
  const { txn } = Route.useSearch();
  const navigate = useNavigate({ from: "/reconciliation" });
  const [tab, setTab] = useState<"queue" | "approved">("queue");
  const [filter, setFilter] = useState<Filter>("all");
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [approveOpen, setApproveOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualAlloc, setManualAlloc] = useState<Allocation[] | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const invById = useMemo(() => new Map(state.invoices.map((i) => [i.id, i])), [state.invoices]);
  const txnById = useMemo(() => new Map(state.transactions.map((t) => [t.id, t])), [state.transactions]);
  const classify = (id: string): Filter => {
    const b = analysis.byTransaction.get(id)?.best;
    if (!b) return "none";
    if (b.flags.some((f) => f !== "low_confidence")) return "attention";
    return b.confidence >= 90 ? "ready" : "all";
  };
  const list = analysis.pending.filter((t) => filter === "all" || classify(t.id) === filter);
  const selected = list.find((t) => t.id === txn) ?? list[0] ?? null;
  const a = selected ? analysis.byTransaction.get(selected.id) : undefined;
  const options = a ? [a.best, ...a.alternatives].filter((p): p is MatchProposal => !!p) : [];
  const proposal = options.find((p) => p.signature === chosen[selected?.id ?? ""]) ?? options[0] ?? null;
  const ready = analysis.pending.map((t) => analysis.byTransaction.get(t.id)?.best).filter((p): p is MatchProposal => !!p && p.confidence >= 90 && !p.flags.length);
  const count = (f: Filter) => analysis.pending.filter((t) => classify(t.id) === f).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Review & approve"
        title="Reconciliation"
        description="Incoming receipts compared with outstanding invoices. Suggestions are ranked by invoice reference and exact amount first. An invoice is only marked paid after you approve the match."
        actions={<Button variant="success" disabled={!ready.length} onClick={() => setBulkOpen(true)}><ShieldCheck /> Approve {ready.length} high-confidence</Button>}
      />
      <Segmented value={tab} onChange={setTab} options={[{ value: "queue", label: "Review queue", count: analysis.pending.length }, { value: "approved", label: "Approved matches", count: state.reconciliations.length }]} />

      {tab === "queue" ? (
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="surface overflow-hidden">
            <div className="border-b border-border p-3">
              <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "ready", label: "Ready", count: count("ready") }, { value: "attention", label: "Flagged", count: count("attention") }, { value: "none", label: "None", count: count("none") }]} />
            </div>
            <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
              {list.map((t) => {
                const b = analysis.byTransaction.get(t.id)?.best;
                return (
                  <li key={t.id}>
                    <button onClick={() => navigate({ search: { txn: t.id } })} className={cn("w-full px-4 py-3 text-left hover:bg-muted/50", selected?.id === t.id && "bg-accent/60")}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{t.description}</span>
                        <Amount cents={t.amount} tone="plain" className="text-sm" />
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span className="truncate">{formatDate(t.date)} · {t.reference || "no ref"}</span>
                        {b ? <ConfidenceMeter value={b.confidence} /> : <span>No suggestion</span>}
                      </div>
                      {b && b.flags.some((f) => f !== "low_confidence") && <div className="mt-1.5 flex flex-wrap gap-1">{b.flags.filter((f) => f !== "low_confidence").map((f) => <FlagBadge key={f} flag={f} />)}</div>}
                    </button>
                  </li>
                );
              })}
              {!list.length && <li><EmptyState icon={CheckCircle2} title="Nothing to review here" description="All receipts in this view have been dealt with." /></li>}
            </ul>
          </div>

          {selected ? (
            <div className="surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
                <div>
                  <div className="eyebrow">Bank receipt · {formatDate(selected.date)}</div>
                  <div className="mt-1 font-serif text-2xl">{selected.description}</div>
                  <div className="mt-1 font-figure text-xs text-muted-foreground">Ref: {selected.reference || "—"}</div>
                </div>
                <Amount cents={selected.amount} signed className="text-2xl" />
              </div>
              {a?.notes.map((n) => <div key={n} className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2.5 text-sm text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0" /> {n}</div>)}

              {proposal ? (
                <div className="mt-5 space-y-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <MatchKindBadge kind={proposal.kind} />
                    {proposal.flags.map((f) => <FlagBadge key={f} flag={f} />)}
                    <ConfidenceMeter value={proposal.confidence} className="ml-auto" />
                  </div>
                  <table className="w-full text-sm">
                    <thead className="border-b border-border"><tr><th className={th}>Invoice</th><th className={th}>Customer</th><th className={cn(th, "text-right")}>Outstanding</th><th className={cn(th, "text-right")}>Allocate</th><th className={cn(th, "text-right")}>Remaining</th></tr></thead>
                    <tbody className="divide-y divide-border">
                      {proposal.allocations.map((al) => { const inv = invById.get(al.invoiceId)!; return (
                        <tr key={al.invoiceId}>
                          <td className={cn(td, "font-figure text-xs font-medium")}>{inv.invoiceNumber}</td>
                          <td className={td}>{inv.customer}</td>
                          <td className={cn(td, "text-right")}><Amount cents={inv.outstanding} tone="muted" /></td>
                          <td className={cn(td, "text-right")}><Amount cents={al.amount} tone="plain" className="font-medium" /></td>
                          <td className={cn(td, "text-right")}><Amount cents={inv.outstanding - al.amount} tone="muted" /></td>
                        </tr>
                      ); })}
                    </tbody>
                  </table>
                  {proposal.unallocated > 0 && <div className="text-xs text-warning">{formatZAR(proposal.unallocated)} of this receipt stays unallocated.</div>}
                  <div className="rounded-md border border-border bg-muted/40 p-4">
                    <div className="eyebrow mb-2">Why this match</div>
                    <ul className="space-y-1.5 text-sm">{proposal.reasons.map((r) => <li key={r} className="flex gap-2"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-info" /> {r}</li>)}</ul>
                  </div>
                  {options.length > 1 && (
                    <div>
                      <div className="eyebrow mb-2">Other candidates</div>
                      <div className="flex flex-wrap gap-2">
                        {options.map((p) => (
                          <button key={p.signature} onClick={() => setChosen((c) => ({ ...c, [selected.id]: p.signature }))} className={cn("rounded-md border px-3 py-2 text-left text-xs", p.signature === proposal.signature ? "border-info bg-info-soft" : "border-border hover:bg-muted")}>
                            <div className="font-medium">{p.allocations.map((x) => invById.get(x.invoiceId)?.invoiceNumber).join(" + ")}</div>
                            <div className="text-muted-foreground">{MATCH_KIND_LABEL[p.kind]} · {p.confidence}%</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 border-t border-border pt-5">
                    <Button variant="success" onClick={() => setApproveOpen(true)}><ShieldCheck /> Approve match</Button>
                    <Button variant="outline" onClick={() => { reject(proposal); toast("Suggestion rejected", { description: "The receipt stays unreconciled." }); }}><X /> Reject suggestion</Button>
                    <Button variant="ghost" onClick={() => setManualOpen(true)}><Hand /> Match manually</Button>
                  </div>
                </div>
              ) : (
                <EmptyState icon={CircleDashed} title="No suggested match" description="No open invoice references or matches this receipt. You can allocate it manually or leave it for investigation." action={<Button variant="outline" onClick={() => setManualOpen(true)}><Hand /> Match manually</Button>} />
              )}

              {proposal && (
                <ApproveDialog open={approveOpen} onOpenChange={setApproveOpen} title="Approve this match?" confirmLabel="Approve and record"
                  summary={<>{formatZAR(selected.amount)} from {selected.description} → {proposal.allocations.map((x) => `${invById.get(x.invoiceId)?.invoiceNumber} (${formatZAR(x.amount)})`).join(", ")}</>}
                  onConfirm={(note) => { try { approve({ transactionId: selected.id, allocations: proposal.allocations, kind: proposal.kind, confidence: proposal.confidence, reasons: proposal.reasons, ...(note ? { note } : {}) }); toast.success("Match approved"); } catch (e) { return fail(e); } }} />
              )}
              <ManualMatchDialog open={manualOpen} onOpenChange={setManualOpen} transaction={selected} invoices={state.invoices} onSubmit={(al) => { setManualOpen(false); setManualAlloc(al); }} />
              <ApproveDialog open={!!manualAlloc} onOpenChange={(o) => !o && setManualAlloc(null)} title="Approve manual match?" confirmLabel="Approve and record"
                summary={<>{formatZAR(selected.amount)} → {(manualAlloc ?? []).map((x) => `${invById.get(x.invoiceId)?.invoiceNumber} (${formatZAR(x.amount)})`).join(", ")}</>}
                onConfirm={(note) => { try { approve({ transactionId: selected.id, allocations: manualAlloc ?? [], kind: "manual", confidence: null, reasons: ["Allocated manually by reviewer."], ...(note ? { note } : {}) }); toast.success("Manual match approved"); } catch (e) { return fail(e); } }} />
            </div>
          ) : (
            <div className="surface"><EmptyState icon={CheckCircle2} title="All receipts reconciled" description="Import a new bank statement to continue." /></div>
          )}
        </div>
      ) : (
        <div className="surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50"><tr><th className={th}>Bank date</th><th className={th}>Receipt</th><th className={th}>Invoices</th><th className={th}>Type</th><th className={th}>Approved</th><th className={cn(th, "text-right")}>Amount</th><th className={th} /></tr></thead>
            <tbody className="divide-y divide-border">
              {state.reconciliations.map((r) => { const t = txnById.get(r.transactionId); return (
                <tr key={r.id}>
                  <td className={cn(td, "font-figure text-xs text-muted-foreground")}>{t ? formatDate(t.date) : "—"}</td>
                  <td className={cn(td, "font-medium")}>{t?.description}</td>
                  <td className={cn(td, "font-figure text-xs")}>{r.allocations.map((x) => invById.get(x.invoiceId)?.invoiceNumber).join(", ")}</td>
                  <td className={td}><MatchKindBadge kind={r.kind} /></td>
                  <td className={cn(td, "text-xs text-muted-foreground")}>{r.approvedBy} · {formatTimestamp(r.approvedAt)}</td>
                  <td className={cn(td, "text-right")}><Amount cents={t?.amount ?? 0} tone="plain" /></td>
                  <td className={td}><Button size="sm" variant="ghost" onClick={() => { undo(r.id); toast("Match reversed", { description: "The invoice balance has been restored." }); }}><RotateCcw /> Undo</Button></td>
                </tr>
              ); })}
            </tbody>
          </table>
          {!state.reconciliations.length && <EmptyState icon={CircleDashed} title="No approved matches yet" />}
        </div>
      )}

      <ApproveDialog open={bulkOpen} onOpenChange={setBulkOpen} allowNote={false} title={`Approve ${ready.length} high-confidence matches?`} confirmLabel={`Approve ${ready.length}`}
        summary={<ul className="space-y-1">{ready.map((p) => <li key={p.signature} className="flex justify-between gap-3"><span className="truncate">{txnById.get(p.transactionId)?.description} → {p.allocations.map((x) => invById.get(x.invoiceId)?.invoiceNumber).join(", ")}</span><span className="font-figure">{formatZAR(txnById.get(p.transactionId)?.amount ?? 0)}</span></li>)}</ul>}
        onConfirm={() => { try { approveMany(ready.map((p) => ({ transactionId: p.transactionId, allocations: p.allocations, kind: p.kind, confidence: p.confidence, reasons: p.reasons }))); toast.success(`${ready.length} matches approved`); } catch (e) { return fail(e); } }} />
    </div>
  );
}
