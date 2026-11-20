import { createFileRoute } from "@tanstack/react-router";
import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { Amount } from "@/components/app/Amount";
import { PageHeader } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { InvoiceStatusBadge, MatchKindBadge } from "@/components/app/StatusBadges";
import { Segmented, td, th } from "@/components/app/Toolbar";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/domain/csv";
import { formatDate } from "@/lib/domain/dates";
import { MATCH_KIND_LABEL } from "@/lib/domain/matching";
import { centsToDecimal, formatZAR } from "@/lib/domain/money";
import { buildReconciliationReportCsv, matchedRows, summarise, unpaidInvoices } from "@/lib/domain/reports";
import { DEMO_COMPANY } from "@/lib/data/sample-data";
import { recordExport } from "@/lib/store/commands";
import { useAnalysis, useReconcileState, useToday } from "@/lib/store/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — AUTMTC Reconcile" },
      { name: "description", content: "Matched payments, unmatched receipts, unpaid invoices and an exportable reconciliation report." },
      { property: "og:title", content: "Reports — AUTMTC Reconcile" },
      { property: "og:description", content: "Exportable reconciliation reports in ZAR." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReportsPage,
});

type Tab = "matched" | "unmatched" | "unpaid";

function ReportsPage() {
  const state = useReconcileState();
  const analysis = useAnalysis();
  const today = useToday();
  const [tab, setTab] = useState<Tab>("matched");
  const s = summarise(state, analysis, today);
  const matched = matchedRows(state);
  const unpaid = unpaidInvoices(state, today);

  function exportFull() {
    downloadCsv(`reconciliation-report-${today}.csv`, buildReconciliationReportCsv(state, analysis, today, DEMO_COMPANY));
    recordExport("Exported the full reconciliation report");
  }
  function exportTab() {
    if (tab === "matched") downloadCsv("matched-payments.csv", [["Bank date", "Description", "Reference", "Amount", "Invoices", "Type", "Approved by"], ...matched.map((m) => [m.txn!.date, m.txn!.description, m.txn!.reference, centsToDecimal(m.txn!.amount), m.invoices.map((i) => i.invoice?.invoiceNumber).join(" "), MATCH_KIND_LABEL[m.rec.kind], m.rec.approvedBy])]);
    if (tab === "unmatched") downloadCsv("unmatched-receipts.csv", [["Bank date", "Description", "Reference", "Amount", "Suggestion"], ...analysis.pending.map((t) => { const b = analysis.byTransaction.get(t.id)?.best; return [t.date, t.description, t.reference, centsToDecimal(t.amount), b ? `${MATCH_KIND_LABEL[b.kind]} (${b.confidence}%)` : "None"]; })]);
    if (tab === "unpaid") downloadCsv("unpaid-invoices.csv", [["Invoice", "Customer", "Due date", "Outstanding", "Days overdue", "Aging"], ...unpaid.map((u) => [u.invoice.invoiceNumber, u.invoice.customer, u.invoice.dueDate, centsToDecimal(u.invoice.outstanding), u.daysOverdue, u.bucket])]);
    recordExport(`Exported the ${tab} report`);
  }

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Reporting · as at ${formatDate(today)}`} title="Reports" description="Reports include reviewer-approved matches only. Suggestions awaiting review are listed as unmatched."
        actions={<><Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button><Button onClick={exportFull}><Download /> Export full report</Button></>} />
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Matched payments" value={formatZAR(s.matchedValue)} detail={`${s.matchedCount} approved receipts`} />
        <StatCard label="Unmatched receipts" value={formatZAR(s.unmatchedValue)} detail={`${s.unmatchedCount} receipts`} />
        <StatCard label="Unpaid invoices" value={formatZAR(s.awaitingValue)} detail={`${s.awaitingCount} invoices · ${formatZAR(s.overdueValue)} overdue`} />
      </div>
      <div className="surface overflow-hidden">
        <div className="no-print flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Segmented value={tab} onChange={setTab} options={[{ value: "matched", label: "Matched payments", count: matched.length }, { value: "unmatched", label: "Unmatched receipts", count: analysis.pending.length }, { value: "unpaid", label: "Unpaid invoices", count: unpaid.length }]} />
          <Button variant="outline" size="sm" onClick={exportTab}><Download /> Export this table</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {tab === "matched" && (<>
              <thead className="border-b border-border bg-muted/50"><tr><th className={th}>Bank date</th><th className={th}>Receipt</th><th className={th}>Invoices</th><th className={th}>Type</th><th className={th}>Approved by</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
              <tbody className="divide-y divide-border">{matched.map((m) => (
                <tr key={m.rec.id}><td className={cn(td, "font-figure text-xs")}>{formatDate(m.txn!.date)}</td><td className={cn(td, "font-medium")}>{m.txn!.description}</td><td className={cn(td, "font-figure text-xs")}>{m.invoices.map((i) => i.invoice?.invoiceNumber).join(", ")}</td><td className={td}><MatchKindBadge kind={m.rec.kind} /></td><td className={cn(td, "text-xs text-muted-foreground")}>{m.rec.approvedBy}</td><td className={cn(td, "text-right")}><Amount cents={m.txn!.amount} tone="plain" /></td></tr>
              ))}</tbody></>)}
            {tab === "unmatched" && (<>
              <thead className="border-b border-border bg-muted/50"><tr><th className={th}>Bank date</th><th className={th}>Description</th><th className={th}>Reference</th><th className={th}>Suggestion</th><th className={cn(th, "text-right")}>Amount</th></tr></thead>
              <tbody className="divide-y divide-border">{analysis.pending.map((t) => { const b = analysis.byTransaction.get(t.id)?.best; return (
                <tr key={t.id}><td className={cn(td, "font-figure text-xs")}>{formatDate(t.date)}</td><td className={cn(td, "font-medium")}>{t.description}</td><td className={cn(td, "font-figure text-xs text-muted-foreground")}>{t.reference}</td><td className={cn(td, "text-xs")}>{b ? `${MATCH_KIND_LABEL[b.kind]} · ${b.confidence}%` : "None"}</td><td className={cn(td, "text-right")}><Amount cents={t.amount} tone="plain" /></td></tr>
              ); })}</tbody></>)}
            {tab === "unpaid" && (<>
              <thead className="border-b border-border bg-muted/50"><tr><th className={th}>Invoice</th><th className={th}>Customer</th><th className={th}>Due date</th><th className={th}>Aging</th><th className={th}>Status</th><th className={cn(th, "text-right")}>Outstanding</th></tr></thead>
              <tbody className="divide-y divide-border">{unpaid.map((u) => (
                <tr key={u.invoice.id}><td className={cn(td, "font-figure text-xs font-medium")}>{u.invoice.invoiceNumber}</td><td className={cn(td, "font-medium")}>{u.invoice.customer}</td><td className={cn(td, "font-figure text-xs")}>{formatDate(u.invoice.dueDate)}</td><td className={cn(td, "text-xs")}>{u.bucket}</td><td className={td}><InvoiceStatusBadge status={u.status} /></td><td className={cn(td, "text-right")}><Amount cents={u.invoice.outstanding} tone="plain" /></td></tr>
              ))}</tbody></>)}
          </table>
        </div>
      </div>
    </div>
  );
}
