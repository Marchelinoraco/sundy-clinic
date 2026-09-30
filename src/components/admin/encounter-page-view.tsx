import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { EncounterDetail } from "@/server/encounter-read";
import { AddendumForm } from "./addendum-form";
import { AuditTrail } from "./audit-trail";
import { EncounterForm } from "./encounter-form";
import { EncounterIntakeContent } from "./encounter-intake-content";
import { EncounterRecord } from "./encounter-record";
import { EncounterWarningsBox } from "./encounter-warnings";

/** Halaman kunjungan (spec 4–5): kepala, peringatan, catatan, adendum, dan jejak. */
export function EncounterPageView({ encounter, canWrite }: { encounter: EncounterDetail; canWrite: boolean }) {
  const { appointment, patient } = encounter;
  const time = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));
  const intakeSlot = <EncounterIntakeContent intake={encounter.intake} />;
  const isFinal = encounter.status === "FINAL";
  const identity = [`No. RM ${patient.medicalRecordNumber}`, patient.ageLabel, patient.genderLabel].filter(Boolean).join(" · ");

  return (
    <div className="max-w-4xl space-y-6">
      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-medium">{patient.name}</h2>
          <Badge variant={isFinal ? "default" : "outline"}>{isFinal ? "Final" : "Draf"}</Badge>
        </div>
        <p>{identity}</p>
        <p>
          {formatIndonesianDate(appointment.startAt)}, {time} WITA · {appointment.branchName} · {appointment.serviceName} ·{" "}
          {appointment.staffName}
        </p>
        <p className="font-mono text-xs text-muted-foreground">{appointment.code}</p>
        <Link href={`/admin/pasien/${patient.id}`} className="underline underline-offset-4">
          Data pasien
        </Link>
      </section>

      <EncounterWarningsBox warnings={encounter.warnings} />

      {!isFinal && canWrite ? (
        <EncounterForm
          encounterId={encounter.id}
          initialVersion={encounter.version}
          initialDraft={encounter.draft}
          options={encounter.options}
          intakeSlot={intakeSlot}
        />
      ) : (
        <EncounterRecord encounter={encounter} intakeSlot={intakeSlot} />
      )}

      {isFinal && (
        <section aria-labelledby="adendum" className="space-y-3">
          <h2 id="adendum" className="text-base font-medium">
            Adendum
          </h2>
          {encounter.addenda.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada adendum.</p>
          ) : (
            <ol className="space-y-2">
              {encounter.addenda.map((addendum) => (
                <li key={addendum.id} className="rounded-md border p-3 text-sm">
                  <p className="whitespace-pre-line">{addendum.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {addendum.authorName} · {formatIndonesianDate(addendum.createdAt)},{" "}
                    {minutesToTimeLabel(witaMinutesOfDay(addendum.createdAt))} WITA
                  </p>
                </li>
              ))}
            </ol>
          )}
          {canWrite && <AddendumForm encounterId={encounter.id} />}
        </section>
      )}

      {encounter.trail && <AuditTrail rows={encounter.trail} />}
    </div>
  );
}
