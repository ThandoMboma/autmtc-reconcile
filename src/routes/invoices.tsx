import { createFileRoute } from "@tanstack/react-router";
import { Download, FileX, Upload } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Amount } from "@/components/app/Amount";
import { CsvImportDialog } from "@/components/app/CsvImportDialog";
import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { InvoiceStatusBadge } from "@/components/app/StatusBadges";
import { SearchField, Segmented, td, th } from "@/components/app/Toolbar";
import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/domain/csv";
import { daysBetween, formatDate } from "@/lib/domain/dates";
import { invoiceSchema } from "@/lib/domain/import-schemas";
import { INVOICE_STATUS_LABEL, invoiceStatus } from "@/lib/domain/invoice-status";
import { centsToDecimal } from "@/lib/domain/money";
import type { InvoiceStatus } from "@/lib/domain/types";
import { importInvoices, recordExport } from "@/lib/store/commands";
import { useReconcileState, useToday } from "@/lib/store/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoice register — AUTMTC Reconcile" },
      { name: "description", content: "Customer invoices with due dates, outstanding balances and payment status." },
      { property: "og:title", content: "Invoice register — AUTMTC Reconcile" },
      { property: "og:description", content: "Outstanding customer invoices, due dates and payment status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: InvoicesPage,
});

type Filter = "all" | InvoiceStatus;

function InvoicesPage() {
  const state = useReconcileState();
  const today = useToday();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const existingKeys = useMemo(() => new Set(state.invoices.map(invoiceSchema.duplicateKey)), [state.invoices]);

  const withStatus = useMemo(
    () => state.invoices.map((i) => ({ inv: i, status: invoiceStatus(i, today) })).sort((a, b) => b.inv.invoiceNumber.localeCompare(a.inv.invoiceNumber)),
    [state.invoices, today],
  );
  const counts = (s: InvoiceStatus) => withStatus.filter((r) => r.status === s).length;
  const needle = q.trim().toLowerCase();
  const rows = withStatus
    .filter((r) => filter === "all" || r.status === filter)
    .filter((r) => !needle || `${r.inv.invoiceNumber} ${r.inv.customer}`.toLowerCase().includes(needle));

  const outstanding = state.invoices.reduce((s, i) => s + i.outstanding, 0);
  const overdue = withStatus.filter((r) => r.inv.outstanding > 0 && r.inv.dueDate < today).reduce((s, r) => s + r.inv.outstanding, 0);
  const billed = state.invoices.reduce((s, i) => s + i.amount, 0);

  function exportRows() {
    downloadCsv("invoice-register.csv", [
      ["Invoice number", "Customer", "Invoice date", "Due date", "Total", "Outstanding", "Status"],
      ...rows.map(({ inv, status }) => [inv.invoiceNumber, inv.customer, inv.invoiceDate, inv.dueDate, centsToDecimal(inv.amount), centsToDecimal(inv.outstanding), INVOICE_STATUS_LABEL[status]]),
    ]);
    recordExport(`Exported ${rows.length} invoices to CSV`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts receivable"
        title="Invoice register"
        description="Customer invoices from your accounting system. Balances only change here when a reviewer approves a reconciliation; your accounting records are never edited."
        actions={
          <>
            <Button variant="outline" onClick={exportRows}><Download /> Export</Button>
            <Button onClick={() => setImportOpen(true)}><Upload /> Import CSV</Button>
          </>
        }
      />

      <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        <Metric label="Total invoiced" value={<Amount cents={billed} tone="plain" />} hint={`${state.invoices.length} invoices`} />
        <Metric label="Outstanding" value={<Amount cents={outstanding} tone="plain" />} hint={`${withStatus.filter((r) => r.inv.outstanding > 0).length} awaiting payment`} />
        <Metric label="Overdue" value={<Amount cents={overdue} tone="plain" className="text-destructive" />} hint={`${counts("overdue") + withStatus.filter((r) => r.status === "partially_paid" && r.inv.dueDate < today).length} past due date`} />
        <Metric label="Collected (approved)" value={<Amount cents={billed - outstanding} tone="plain" className="text-success" />} hint={`${counts("paid")} fully paid`} />
      </div>

      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: withStatus.length },
              { value: "open", label: "Open", count: counts("open") },
              { value: "overdue", label: "Overdue", count: counts("overdue") },
              { value: "partially_paid", label: "Part paid", count: counts("partially_paid") },
              { value: "paid", label: "Paid", count: counts("paid") },
            ]}
          />
          <SearchField value={q} onChange={setQ} placeholder="Search invoice number or customer" />
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th className={th}>Invoice</th>
                  <th className={th}>Customer</th>
                  <th className={th}>Invoice date</th>
                  <th className={th}>Due date</th>
                  <th className={cn(th, "text-right")}>Total</th>
                  <th className={cn(th, "text-right")}>Outstanding</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map(({ inv, status }) => {
                  const late = inv.outstanding > 0 ? daysBetween(inv.dueDate, today) : 0;
                  return (
                    <tr key={inv.id} className="hover:bg-muted/40">
                      <td className={cn(td, "font-figure text-xs font-medium")}>{inv.invoiceNumber}</td>
                      <td className={cn(td, "font-medium")}>{inv.customer}</td>
                      <td className={cn(td, "whitespace-nowrap font-figure text-xs text-muted-foreground")}>{formatDate(inv.invoiceDate)}</td>
                      <td className={cn(td, "whitespace-nowrap font-figure text-xs")}>
                        {formatDate(inv.dueDate)}
                        {late > 0 && <span className="ml-2 text-destructive">+{late}d</span>}
                      </td>
                      <td className={cn(td, "text-right")}><Amount cents={inv.amount} tone="muted" /></td>
                      <td className={cn(td, "text-right")}><Amount cents={inv.outstanding} tone="plain" className={cn("font-medium", inv.outstanding === 0 && "text-muted-foreground")} /></td>
                      <td className={td}><InvoiceStatusBadge status={status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={FileX} title="No invoices match these filters" description="Clear the search or import an invoice register CSV." />
        )}
        <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{rows.length} of {state.invoices.length} invoices</div>
      </div>

      <CsvImportDialog open={importOpen} onOpenChange={setImportOpen} schema={invoiceSchema} existingKeys={existingKeys} onImport={importInvoices} />
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: ReactNode; hint: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 text-xl">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
