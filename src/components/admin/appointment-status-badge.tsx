import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL, type AppointmentStatusValue } from "@/lib/appointment-status";

const STATUS_VARIANT: Record<
  AppointmentStatusValue,
  "default" | "secondary" | "destructive" | "outline"
> = {
  MENUNGGU_KONFIRMASI: "outline",
  TERKONFIRMASI: "default",
  HADIR: "secondary",
  SELESAI: "secondary",
  DIBATALKAN: "destructive",
  TIDAK_HADIR: "destructive",
  KEDALUWARSA: "secondary",
};

export function AppointmentStatusBadge({ status }: { status: AppointmentStatusValue }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
