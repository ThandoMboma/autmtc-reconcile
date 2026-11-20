import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownLeft, ArrowUpRight, Download, Inbox, Upload } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Amount } from "@/components/app/Amount";
import { CsvImportDialog } from "@/components/app/CsvImportDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { SearchField, Segmented, td, th } from "@/components/app/Toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { centsToDecimal } from "@/lib/domain/money";
import { downloadCsv } from "@/lib/domain/csv";
import { formatDate } from "@/lib/domain/dates";
import { bankTransactionSchema } from "@/lib/domain/import-schemas";
import { importTransactions, recordExport } from "@/lib/store/commands";
import { useAnalysis, useReconcileState } from "@/lib/store/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/transactions")({
  head: () => ({
    meta: [
      { title: "Bank transactions — AUTMTC Reconcile" },
      { name: "description", content: "Imported bank statement lines with incoming and outgoing transactions and reconciliation status." },
      { property: "og:title", content: "Bank transactions — AUTMTC Reconcile" },
      { property: "og:description", content: "Bank statement lines, CSV import and reconciliation status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TransactionsPage,
});

type Direction = "all" | "incoming" | "outgoing";
type StatusFilter = "all" | "reconciled" | "suggested" | "unmatched";

function TransactionsPage() {
  const state = useReconcileState();
  const analysis = useAnalysis();
  const [direction, setDirection] = useState<Direction>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);

  const existingKeys = useMemo(() => new Set(state.transactions.map(bankTransactionSchema.duplicateKey)), [state.transactions]);

  const statusOf = (id: string, amount: number) => {
    if (amount < 0) return "outgoing" as const;
    if (analysis.reconciledIds.has(id)) return "reconciled" as const;
    const a = analysis.byTransaction.get(id);
    if (a?.best) return a.best.flags.some((f) => f !== "low_confidence") ? ("flagged" as const) : ("suggested" as const);
    return "unmatched" as const;
  };

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...state.transactions]
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .filter((t) => direction === "all" || (direction === "incoming" ? t.amount > 0 : t.amount < 0))
      .filter((t) => {
        if (status === "all") return true;
        const st = statusOf(t.id, t.amount);
        return status === "suggested" ? st === "suggested" || st === "flagged" : st === status;
      })
      .filter((t) => !needle || `${t.description} ${t.reference}`.toLowerCase().includes(needle) || centsToDecimal(Math.abs(t.amount)).includes(needle));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.transactions, direction, status, q, analysis]);

  const moneyIn = state.transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const moneyOut = state.transactions.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0);
  const incomingCount = state.transactions.filter((t) => t.amount > 0).length;

  function exportRows() {
    downloadCsv("bank-transactions.csv", [
      ["Date", "Description", "Reference", "Direction", "Amount", "Status"],
      ...rows.map((t) => [t.date, t.description, t.reference, t.amount > 0 ? "Incoming" : "Outgoing", centsToDecimal(t.amount), STATUS_LABEL[statusOf(t.id, t.amount)]]),
    ]);
    recordExport(`Exported ${rows.length} bank transactions to CSV`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bank statement"
        title="Bank transactions"
        description="Statement lines imported from your bank's CSV export. Only incoming credits are matched against invoices; outgoing debits are listed for completeness."
        actions={
          <>
            <Button variant="outline" onClick={exportRows}><Download /> Export</Button>
            <Button onClick={() => setImportOpen(true)}><Upload /> Import CSV</Button>
          </>
        }
      />

      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Metric label="Money in" value={<Amount cents={moneyIn} signed />} hint={`${incomingCount} credits`} />
        <Metric label="Money out" value={<Amount cents={moneyOut} />} hint={`${state.transactions.length - incomingCount} debits`} />
        <Metric label="Net movement" value={<Amount cents={moneyIn + moneyOut} signed />} hint="For the imported period" />
        <Metric label="Receipts unreconciled" value={<span className="font-figure">{analysis.pending.length}</span>} hint="Waiting for review" />
      </div>

      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={direction} onChange={setDirection} options={[{ value: "all", label: "All" }, { value: "incoming", label: "Incoming" }, { value: "outgoing", label: "Outgoing" }]} />
            <Segmented value={status} onChange={setStatus} options={[{ value: "all", label: "Any status" }, { value: "reconciled", label: "Reconciled" }, { value: "suggested", label: "Suggested" }, { value: "unmatched", label: "Unmatched" }]} />
          </div>
          <SearchField value={q} onChange={setQ} placeholder="Search description, reference or amount" />
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Description</th>
                  <th className={th}>Reference</th>
                  <th className={th}>Type</th>
                  <th className={th}>Status</th>
                  <th className={cn(th, "text-right")}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((t) => {
                  const st = statusOf(t.id, t.amount);
                  return (
                    <tr key={t.id} className="hover:bg-muted/40">
                      <td className={cn(td, "whitespace-nowrap font-figure text-xs text-muted-foreground")}>{formatDate(t.date)}</td>
                      <td className={cn(td, "font-medium")}>{t.description}</td>
                      <td className={cn(td, "font-figure text-xs text-muted-foreground")}>{t.reference || "—"}</td>
                      <td className={td}>
                        {t.amount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-incoming"><ArrowDownLeft className="size-3.5" /> Incoming</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground"><ArrowUpRight className="size-3.5" /> Outgoing</span>
                        )}
                      </td>
                      <td className={td}>
                        {st === "outgoing" ? (
                          <span className="text-xs text-muted-foreground">Not matched to invoices</span>
                        ) : st === "reconciled" ? (
                          <Badge variant="success">Reconciled</Badge>
                        ) : (
                          <Link to="/reconciliation" search={{ txn: t.id }} className="inline-flex">
                            <Badge variant={st === "flagged" ? "danger" : st === "suggested" ? "info" : "neutral"}>{STATUS_LABEL[st]} →</Badge>
                          </Link>
                        )}
                      </td>
                      <td className={cn(td, "text-right")}><Amount cents={t.amount} signed className="font-medium" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Inbox} title="No transactions match these filters" description="Clear the search or import a bank statement CSV." action={<Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload /> Import CSV</Button>} />
        )}
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{rows.length} of {state.transactions.length} transactions</div>
      </div>

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} schema={bankTransactionSchema} existingKeys={existingKeys} onImport={importTransactions} />
    </div>
  );
}

const STATUS_LABEL = { outgoing: "Outgoing", reconciled: "Reconciled", suggested: "Suggested match", flagged: "Needs attention", unmatched: "Unmatched" } as const;

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 text-xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
