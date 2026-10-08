import { INVOICE_STATUS_LABEL, type InvoiceDisplayStatus } from "@/lib/invoice";
import { StatusChip } from "../mui/status-chip";

/** Status tampil tagihan (spec tagihan 3.2). */
export function InvoiceStatusBadge({ status }: { status: InvoiceDisplayStatus }) {
  const tone = status === "LUNAS" ? "success" : status === "DIBATALKAN" ? "error" : "neutral";
  return <StatusChip label={INVOICE_STATUS_LABEL[status]} tone={tone} />;
}
