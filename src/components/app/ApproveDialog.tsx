import { ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** Human-approval gate. Approve is disabled until the reviewer confirms they checked the match. */
export function ApproveDialog({
  open,
  onOpenChange,
  title,
  summary,
  confirmLabel,
  onConfirm,
  allowNote = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  summary: ReactNode;
  confirmLabel: string;
  onConfirm: (note: string) => boolean | void;
  allowNote?: boolean;
}) {
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) { setChecked(false); setNote(""); }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="eyebrow">Reviewer approval</div>
          <DialogTitle className="font-serif text-xl">{title}</DialogTitle>
          <DialogDescription>Approving records this match in AUTMTC Reconcile and reduces the invoice balance here. No payment is made and your accounting system is not changed.</DialogDescription>
        </DialogHeader>
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm">{summary}</div>
        {allowNote && (
          <div>
            <label htmlFor="approval-note" className="mb-1.5 block text-xs font-medium">Note for audit trail (optional)</label>
            <Textarea id="approval-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Confirmed against remittance advice received 18 Nov" rows={2} />
          </div>
        )}
        <label className="flex items-start gap-3 rounded-md border border-info/30 bg-info-soft p-3 text-sm">
          <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} className="mt-0.5" aria-label="I have reviewed this match" />
          <span>I have reviewed the bank line and invoice{typeof summary === "string" ? "" : "s"} above and confirm this match is correct.</span>
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="success"
            disabled={!checked}
            onClick={() => {
              const ok = onConfirm(note.trim());
              if (ok !== false) { onOpenChange(false); setChecked(false); setNote(""); }
            }}
          >
            <ShieldCheck /> {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
