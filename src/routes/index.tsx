import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight, Banknote, CheckCircle2, CircleDashed, Download, FileText, FileUp, Link2, RotateCcw, ShieldAlert, Upload, X,
} from "lucide-react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Amount } from "@/components/app/Amount";
import { PageHeader, SectionTitle } from "@/components/app/PageHeader";
import { StatCard } from "@/components/app/StatCard";
import { Button } from "@/components/ui/button";
import { formatDate, formatTimestamp } from "@/lib/domain/dates";
import { formatZAR } from "@/lib/domain/money";
import { AGING_BUCKETS, summarise, unpaidInvoices } from "@/lib/domain/reports";
import type { ActivityKind } from "@/lib/domain/types";
import { useAnalysis, useReconcileState, useToday } from "@/lib/store/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — AUTMTC Reconcile" },
      { name: "description", content: "Overview of bank receipts, matched payments, unmatched transactions and invoices awaiting payment." },
      { property: "og:title", content: "Dashboard — AUTMTC Reconcile" },
      { property: "og:description", content: "Bank receipts, matched payments and invoices awaiting payment at a glance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const ACTIVITY_ICON: Record<ActivityKind, typeof CheckCircle2> = {
  approve: CheckCircle2,
  reject: X,
  undo: RotateCcw,
  import_transactions: Upload,
  import_invoices: FileUp,
  reset: RotateCcw,
  export: Download,
};

function Dashboard() {
  const state = useReconcileState();
  const analysis = useAnalysis();
  const today = useToday();
  const s = summarise(state, analysis, today);
  const unpaid = unpaidInvoices(state, today);

  const chart = useMemo(() => {
    const byDate = new Map<string, { date: string; matched: number; unmatched: number }>();
    for (const t of state.transactions) {
      if (t.amount <= 0) continue;
      const row = byDate.get(t.date) ?? { date: t.date, matched: 0, unmatched: 0 };
      if (analysis.reconciledIds.has(t.id)) row.matched += t.amount / 100;
      else row.unmatched += t.amount / 100;
      byDate.set(t.date, row);
    }
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-16);
  }, [state.transactions, analysis.reconciledIds]);

  const aging = AGING_BUCKETS.map((b) => {
    const items = unpaid.filter((u) => u.bucket === b);
    return { bucket: b, count: items.length, value: items.reduce((x, u) => x + u.invoice.outstanding, 0) };
  });
  const agingMax = Math.max(1, ...aging.map((a) => a.value));
  const ready = s.highConfidenceCount;
  const flagged = s.flaggedCount;
  const noSuggestion = s.unmatchedCount - s.suggestionCount;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={`Overview · as at ${formatDate(today)}`}
        title="Reconciliation overview"
        description="Receipts from your bank statement compared with your invoice register. Matches are suggested automatically and only recorded once a reviewer approves them."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/transactions"><Upload /> Import statement</Link>
            </Button>
            <Button asChild>
              <Link to="/reconciliation">Review {s.unmatchedCount} receipts <ArrowRight /></Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard emphasis label="Total bank receipts" icon={Banknote} value={formatZAR(s.receiptsTotal)} detail={`${s.receiptsCount} incoming transactions`} />
        <StatCard label="Matched payments" icon={Link2} value={formatZAR(s.matchedValue)} detail={<><span className="font-medium text-success">{s.matchedCount} approved</span> · {Math.round(s.matchRate * 100)}% of receipts</>} />
        <StatCard label="Unmatched transactions" icon={CircleDashed} value={formatZAR(s.unmatchedValue)} detail={<><span className="font-medium text-foreground">{s.unmatchedCount} receipts</span> awaiting review</>} />
        <StatCard label="Invoices awaiting payment" icon={FileText} value={formatZAR(s.awaitingValue)} detail={<><span className="font-medium text-foreground">{s.awaitingCount} invoices</span> · <span className="text-destructive">{formatZAR(s.overdueValue)} overdue</span></>} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="surface xl:col-span-2">
          <SectionTitle title="Daily receipts" description="Incoming bank credits, split by reconciliation status (ZAR)" actions={
            <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-1" /> Matched</span>
              <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-chart-3" /> Unmatched</span>
            </div>
          } />
          <div className="h-[280px] px-3 pb-4 pt-5">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} barCategoryGap="28%">
                <CartesianGrid vertical={false} stroke="var(--color-border)" />
                <XAxis dataKey="date" tickFormatter={(d: string) => formatDate(d).slice(0, 6)} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} axisLine={false} tickLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: "var(--color-muted)" }}
                  contentStyle={{ borderRadius: 8, border: "1px solid var(--color-border)", fontSize: 12, boxShadow: "var(--shadow-raised)" }}
                  labelFormatter={(d) => formatDate(String(d))}
                  formatter={(v: number, name) => [formatZAR(Math.round(v * 100)), name === "matched" ? "Matched" : "Unmatched"]}
                />
                <Bar dataKey="matched" stackId="a" fill="var(--color-chart-1)" />
                <Bar dataKey="unmatched" stackId="a" fill="var(--color-chart-3)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="surface flex flex-col">
          <SectionTitle title="Review queue" description="Receipts waiting for a reviewer" />
          <div className="flex-1 space-y-5 p-5">
            <div>
              <div className="flex items-baseline justify-between">
                <span className="font-figure text-3xl">{Math.round(s.matchRate * 100)}%</span>
                <span className="text-xs text-muted-foreground">of receipts reconciled</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${s.matchRate * 100}%` }} />
              </div>
            </div>
            <div className="divide-y divide-border rounded-md border border-border">
              <QueueRow icon={CheckCircle2} tone="text-success" label="Ready to approve" hint="High confidence, no flags" value={ready} />
              <QueueRow icon={ShieldAlert} tone="text-destructive" label="Needs attention" hint="Duplicate, ambiguous or conflicting" value={flagged} />
              <QueueRow icon={CircleDashed} tone="text-muted-foreground" label="No suggestion" hint="Match manually or investigate" value={noSuggestion} />
            </div>
          </div>
          <div className="border-t border-border p-4">
            <Button variant="outline" className="w-full" asChild>
              <Link to="/reconciliation">Open reconciliation <ArrowRight /></Link>
            </Button>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="surface xl:col-span-2">
          <SectionTitle title="Recent activity" description="Imports, approvals and reversals in this workspace" />
          <ul className="divide-y divide-border">
            {state.activity.slice(0, 8).map((a) => {
              const Icon = ACTIVITY_ICON[a.kind];
              return (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3">
                  <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-full", a.kind === "approve" ? "bg-success-soft text-success" : a.kind === "reject" || a.kind === "undo" ? "bg-warning-soft text-warning" : "bg-info-soft text-info")}>
                    <Icon className="size-4" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">{a.message}</div>
                    <div className="text-xs text-muted-foreground">{formatTimestamp(a.at)}</div>
                  </div>
                  {a.amount != null && <Amount cents={a.amount} className="text-sm" />}
                </li>
              );
            })}
            {!state.activity.length && <li className="px-5 py-8 text-center text-sm text-muted-foreground">No activity yet.</li>}
          </ul>
        </section>

        <section className="surface">
          <SectionTitle title="Invoice aging" description="Outstanding balance by days past due" actions={<Link to="/invoices" className="text-xs font-medium text-info hover:underline">View register</Link>} />
          <div className="space-y-4 p-5">
            {aging.map((a) => (
              <div key={a.bucket}>
                <div className="mb-1.5 flex items-baseline justify-between text-xs">
                  <span className="font-medium text-foreground">{a.bucket}</span>
                  <span className="text-muted-foreground">{a.count} · <Amount cents={a.value} tone="plain" className="text-foreground" /></span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full", a.bucket === "Not yet due" ? "bg-chart-2" : a.bucket === "1–30 days" ? "bg-warning" : "bg-destructive")} style={{ width: `${(a.value / agingMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function QueueRow({ icon: Icon, tone, label, hint, value }: { icon: typeof CheckCircle2; tone: string; label: string; hint: string; value: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Icon className={cn("size-4", tone)} strokeWidth={1.75} />
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <span className="font-figure text-lg">{value}</span>
    </div>
  );
}
