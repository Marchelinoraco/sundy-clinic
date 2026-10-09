import { DISPENSING_STATUS_LABEL, type DispensingStatusValue } from "@/lib/dispensing";
import { StatusChip } from "../mui/status-chip";

export function DispensingStatusBadge({ status }: { status: DispensingStatusValue }) {
  return <StatusChip label={DISPENSING_STATUS_LABEL[status]} tone={status === "MENUNGGU" ? "warning" : "success"} />;
}
