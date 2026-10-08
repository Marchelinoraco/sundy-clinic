import { STATUS_LABEL, type AppointmentStatusValue } from "@/lib/appointment-status";
import { StatusChip, type StatusTone } from "./mui/status-chip";

const STATUS_TONE: Record<AppointmentStatusValue, StatusTone> = {
  MENUNGGU_KONFIRMASI: "neutral",
  TERKONFIRMASI: "primary",
  HADIR: "info",
  SELESAI: "success",
  DIBATALKAN: "error",
  TIDAK_HADIR: "error",
  KEDALUWARSA: "neutral",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatusValue }) {
  return <StatusChip label={STATUS_LABEL[status]} tone={STATUS_TONE[status]} />;
}
