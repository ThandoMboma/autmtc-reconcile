import type { Invoice, InvoiceStatus, IsoDate } from "./types";

export function invoiceStatus(inv: Invoice, today: IsoDate): InvoiceStatus {
  if (inv.outstanding <= 0) return "paid";
  if (inv.outstanding < inv.amount) return "partially_paid";
  if (inv.dueDate < today) return "overdue";
  return "open";
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  open: "Open",
  overdue: "Overdue",
  partially_paid: "Part paid",
  paid: "Paid",
};
