import { AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Amount } from "./Amount";
import { SearchField } from "./Toolbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/domain/dates";
import { centsToDecimal, formatZAR, parseAmount } from "@/lib/domain/money";
import type { Allocation, BankTransaction, Invoice } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function ManualMatchDialog({
  open,
  onOpenChange,
  transaction,
  invoices,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  transaction: BankTransaction;
  invoices: Invoice[];
  onSubmit: (allocations: Allocation[]) => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Record<string, string>>({});
  const open_ = useMemo(() => invoices.filter((i) => i.outstanding > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)), [invoices]);
  const needle = q.trim().toLowerCase();
  const list = open_.filter((i) => !needle || `${i.invoiceNumber} ${i.customer} ${centsToDecimal(i.outstanding)}`.toLowerCase().includes(needle));

  const parsed = Object.entries(selected).map(([id, raw]) => ({ id, raw, r: parseAmount(raw), inv: open_.find((i) => i.id === id)! }));
  const errors: string[] = [];
  for (const p of parsed) {
    if (!p.r.ok) errors.push(`${p.inv.invoiceNumber}: ${p.r.error}`);
    else if (p.r.value <= 0) errors.push(`${p.inv.invoiceNumber}: allocation must be more than zero.`);
    else if (p.r.value > p.inv.outstanding) errors.push(`${p.inv.invoiceNumber}: only ${formatZAR(p.inv.outstanding)} is outstanding.`);
  }
  const total = parsed.reduce((s, p) => s + (p.r.ok ? p.r.value : 0), 0);
  const remaining = transaction.amount - total;
  if (remaining < 0) errors.push(`Allocations exceed the payment by ${formatZAR(-remaining)}.`);

  function toggle(inv: Invoice) {
    setSelected((s) => {
      const next = { ...s };
      if (next[inv.id] != null) delete next[inv.id];
      else {
        const used = Object.entries(next).reduce((x, [, raw]) => { const r = parseAmount(raw); return x + (r.ok ? r.value : 0); }, 0);
        next[inv.id] = centsToDecimal(Math.max(0, Math.min(inv.outstanding, transaction.amount - used)));
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setSelected({}); setQ(""); } }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <div className="flex max-h-[90vh] flex-col">
          <DialogHeader className="border-b border-border px-6 py-5">
            <div className="eyebrow">Manual match</div>
            <DialogTitle className="font-serif text-xl">Allocate {formatZAR(transaction.amount)} to invoices</DialogTitle>
            <DialogDescription>
              {transaction.description} · {transaction.reference || "no reference"} · {formatDate(transaction.date)}
            </DialogDescription>
          </DialogHeader>
          <div className="border-b border-border px-6 py-3"><SearchField value={q} onChange={setQ} placeholder="Search invoice, customer or amount" /></div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-border">
                {list.map((inv) => {
                  const on = selected[inv.id] != null;
                  return (
                    <tr key={inv.id} className={cn(on && "bg-accent/50")}>
                      <td className="w-10 px-4 py-2.5"><Checkbox checked={on} onCheckedChange={() => toggle(inv)} aria-label={`Select ${inv.invoiceNumber}`} /></td>
                      <td className="px-2 py-2.5">
                        <div className="font-figure text-xs font-medium">{inv.invoiceNumber}</div>
                        <div className="text-xs text-muted-foreground">{inv.customer}</div>
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground">Due {formatDate(inv.dueDate)}</td>
                      <td className="px-2 py-2.5 text-right"><Amount cents={inv.outstanding} tone="plain" className="text-xs" /></td>
                      <td className="w-36 px-4 py-2.5">
                        {on && (
                          <Input
                            value={selected[inv.id]}
                            onChange={(e) => setSelected((s) => ({ ...s, [inv.id]: e.target.value }))}
                            className="h-8 text-right font-figure text-xs"
                            aria-label={`Allocation for ${inv.invoiceNumber}`}
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!list.length && <tr><td className="px-6 py-8 text-center text-sm text-muted-foreground">No open invoices found.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="space-y-2 border-t border-border bg-muted/40 px-6 py-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Allocated</span><Amount cents={total} tone="plain" /></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Unallocated</span><Amount cents={remaining} tone="plain" className={cn(remaining < 0 && "text-destructive")} /></div>
            {errors.map((e) => (
              <div key={e} className="flex items-center gap-2 text-xs text-destructive"><AlertCircle className="size-3.5" /> {e}</div>
            ))}
          </div>
          <DialogFooter className="border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              disabled={!parsed.length || errors.length > 0}
              onClick={() => onSubmit(parsed.map((p) => ({ invoiceId: p.id, amount: p.r.ok ? p.r.value : 0 })))}
            >
              Continue to approval
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
