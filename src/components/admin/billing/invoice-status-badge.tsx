import { Badge } from "@/components/ui/badge";
import { INVOICE_STATUS_LABEL, type InvoiceDisplayStatus } from "@/lib/invoice";

/** Status tampil tagihan (spec tagihan 3.2). */
export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  const variant = status === "LUNAS" ? "default" : status === "DIBATALKAN" ? "destructive" : "outline";
  return <Badge variant={variant}>{INVOICE_STATUS_LABEL[status]}</Badge>;
}
