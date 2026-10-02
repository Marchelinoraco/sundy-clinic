import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { IntakeDetail } from "@/server/intake";
import { IntakeApprovalForm } from "./intake-approval-form";
import { IntakeClinicalContent } from "./intake-clinical-content";

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
          {intake.needsFullIntake && <Badge variant="outline">Belum punya isian lengkap</Badge>}
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
          <IntakeClinicalContent clinical={clinical} />

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
