import { Badge } from "@/components/ui/badge";
import { DISPENSING_STATUS_LABEL, type DispensingStatusValue } from "@/lib/dispensing";

export function DispensingStatusBadge({ status }: { status: DispensingStatusValue }) {
  return <Badge variant={status === "MENUNGGU" ? "outline" : "default"}>{DISPENSING_STATUS_LABEL[status]}</Badge>;
}
