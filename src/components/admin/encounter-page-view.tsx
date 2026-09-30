import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { EncounterDetail } from "@/server/encounter-read";
import { EncounterWorkspace } from "./encounter-workspace";

/** Halaman kunjungan (spec UI B bagian 3): kepala satu baris dan ruang kerja dua kolom. */
export function EncounterPageView({ encounter, canWrite }: { encounter: EncounterDetail; canWrite: boolean }) {
  const { appointment, patient } = encounter;
  const isFinal = encounter.status === "FINAL";
  const time = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));
  const summary = [
    `No. RM ${patient.medicalRecordNumber}`,
    patient.ageLabel,
    patient.genderLabel,
    `${formatIndonesianDate(appointment.startAt)}, ${time} WITA`,
    appointment.branchName,
    appointment.serviceName,
    appointment.staffName,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="max-w-7xl space-y-4">
      <section className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3 text-sm">
        <h2 className="text-lg font-medium">{patient.name}</h2>
        <Badge variant={isFinal ? "default" : "outline"}>{isFinal ? "Final" : "Draf"}</Badge>
        <p className="text-muted-foreground">{summary}</p>
        <span className="font-mono text-xs text-muted-foreground">{appointment.code}</span>
        <Link href={`/admin/pasien/${patient.id}`} className="ml-auto underline underline-offset-4">
          Data pasien
        </Link>
      </section>
      <EncounterWorkspace encounter={encounter} canWrite={canWrite} />
    </div>
  );
}
