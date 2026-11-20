import { AlertTriangle, Copy, GitMerge, HelpCircle, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABEL } from "@/lib/domain/invoice-status";
import { confidenceBand, MATCH_FLAG_LABEL, MATCH_KIND_LABEL } from "@/lib/domain/matching";
import type { InvoiceStatus, MatchFlag, MatchKind } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const variant = { open: "info", overdue: "danger", partially_paid: "warning", paid: "success" } as const;
  return <Badge variant={variant[status]}>{INVOICE_STATUS_LABEL[status]}</Badge>;
}

export function MatchKindBadge({ kind }: { kind: MatchKind | "manual" }) {
  return <Badge variant="neutral">{MATCH_KIND_LABEL[kind]}</Badge>;
}

const FLAG_ICON = { duplicate: Copy, ambiguous: HelpCircle, conflict: GitMerge, overpayment: TrendingUp, low_confidence: AlertTriangle } as const;

export function FlagBadge({ flag }: { flag: MatchFlag }) {
  const Icon = FLAG_ICON[flag];
  return (
    <Badge variant={flag === "low_confidence" ? "neutral" : flag === "overpayment" ? "warning" : "danger"}>
      <Icon className="size-3" />
      {MATCH_FLAG_LABEL[flag]}
    </Badge>
  );
}

export function ConfidenceMeter({ value, className }: { value: number; className?: string }) {
  const band = confidenceBand(value);
  const bar = { high: "bg-success", medium: "bg-info", low: "bg-warning" }[band];
  const text = { high: "text-success", medium: "text-info", low: "text-warning" }[band];
  return (
    <div className={cn("flex items-center gap-2", className)} title={`${value}% confidence`}>
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${value}%` }} />
      </div>
      <span className={cn("font-figure text-xs font-medium", text)}>{value}%</span>
    </div>
  );
}
