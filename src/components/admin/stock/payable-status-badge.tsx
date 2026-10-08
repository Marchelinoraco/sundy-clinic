import Stack from "@mui/material/Stack";
import { PAYABLE_STATUS_LABEL, type PayableStatus } from "@/lib/stock";
import { StatusChip } from "../mui/status-chip";

/** Status faktur (spec stok 4.2), ditambah tanda Terlambat. */
export function PayableStatusBadge({ status, overdue }: { status: PayableStatus; overdue: boolean }) {
  return (
    <Stack component="span" direction="row" spacing={0.5} useFlexGap sx={{ display: "inline-flex", flexWrap: "wrap" }}>
      <StatusChip label={PAYABLE_STATUS_LABEL[status]} tone={status === "LUNAS" ? "success" : "neutral"} />
      {overdue && <StatusChip label="Terlambat" tone="error" />}
    </Stack>
  );
}
