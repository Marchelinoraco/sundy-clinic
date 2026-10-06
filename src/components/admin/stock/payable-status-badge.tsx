import { Badge } from "@/components/ui/badge";
import { PAYABLE_STATUS_LABEL, type PayableStatus } from "@/lib/stock";

/** Status faktur (spec stok 4.2), ditambah tanda Terlambat. */
export function PayableStatusBadge({ status, overdue }: { status: PayableStatus; overdue: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge variant={status === "LUNAS" ? "default" : "outline"}>{PAYABLE_STATUS_LABEL[status]}</Badge>
      {overdue && <Badge variant="destructive">Terlambat</Badge>}
    </span>
  );
}
