import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { IntakeDetail } from "@/server/intake";
import { IntakeApprovalForm } from "./intake-approval-form";

const STATUS_LABEL: Record<IntakeDetail["status"], string> = {
  MENUNGGU_DIISI: "Menunggu diisi pasien",
  TERISI: "Terisi — belum diperiksa dokter",
  DIPERIKSA: "Sudah diperiksa dokter",
};

export function IntakeView({ intake }: { intake: IntakeDetail }) {
  const { appointment, identity, clinical } = intake;
  const time = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));

  return (
    <div className="max-w-3xl space-y-6">
      <section className="space-y-1 rounded-lg border p-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{appointment.code}</span>
          <Badge variant="outline">{STATUS_LABEL[intake.status]}</Badge>
          <Badge variant="secondary">{intake.kind === "LENGKAP" ? "Kuis lengkap" : "Kuis pendek"}</Badge>
        </div>
        <p>
          {appointment.serviceName} · {appointment.staffName} · {formatIndonesianDate(appointment.startAt)}, {time} WITA
        </p>
        <p>
          Pasien:{" "}
          {intake.patient ? (
            <Link href={`/admin/pasien/${intake.patient.id}`} className="underline underline-offset-4">
              {intake.patient.name} ({intake.patient.medicalRecordNumber})
            </Link>
          ) : (
            <Badge variant="outline">Belum dicocokkan</Badge>
          )}
        </p>
        {intake.review && (
          <p className="text-muted-foreground">
            Diperiksa oleh {intake.review.reviewerName}, {formatIndonesianDate(intake.review.reviewedAt)}
          </p>
        )}
      </section>

      <section className="space-y-1 text-sm">
        <h2 className="text-base font-medium">Data diri dari isian</h2>
        <p>{identity.name ?? "—"} · {identity.whatsapp ?? "—"} · lahir {identity.birthDateLabel ?? "—"}</p>
        {identity.genderLabel && <p>{identity.genderLabel} · {identity.occupation ?? "—"}</p>}
        {identity.address && <p>{identity.address}</p>}
      </section>

      {!clinical ? (
        <p className="text-sm text-muted-foreground">Pasien belum mengisi kuis.</p>
      ) : (
        <>
          {clinical.sections.map((section) => (
            <section key={section.title} className="space-y-1">
              <h2 className="text-base font-medium">{section.title}</h2>
              <ul className="list-disc space-y-0.5 pl-5 text-sm">
                {section.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ))}

          {clinical.activities && (
            <section className="space-y-2">
              <h2 className="text-base font-medium">Aktivitas {clinical.activityDateLabel ?? "kemarin"}</h2>
              <table aria-label={`Aktivitas ${clinical.activityDateLabel ?? "kemarin"}`} className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="w-16 py-1">Jam</th>
                    <th className="py-1">Catatan</th>
                  </tr>
                </thead>
                <tbody>
                  {clinical.activities.map((row) => (
                    <tr key={row.hour} className="border-b align-top">
                      <td className="py-1 tabular-nums text-muted-foreground">{row.label}</td>
                      <td className="py-1">
                        {row.entries.map((entry, index) => (
                          <span key={index} className="mr-2 inline-block">
                            <span className="text-muted-foreground">{entry.kindLabel}:</span> {entry.text}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {intake.approval?.state === "ready" && (
            // key: formulir dibuat ulang dengan isi awal baru setelah router.refresh().
            <IntakeApprovalForm key={intake.approval.patientVersion} intakeId={intake.id} approval={intake.approval} />
          )}
          {intake.approval?.state === "needs-match" && (
            <p className="rounded-lg border p-4 text-sm text-muted-foreground">
              Cocokkan booking ini dengan pasien di menu Booking sebelum menyetujui isian ke data pasien.
            </p>
          )}
        </>
      )}
    </div>
  );
}
