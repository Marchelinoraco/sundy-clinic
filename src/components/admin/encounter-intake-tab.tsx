import Link from "next/link";
import { formatShortIndonesianDate } from "@/lib/format";
import type { EncounterIntake } from "@/server/encounter-read";
import type { ReadyIntakeApproval } from "@/server/intake-clinical";
import { IntakeApprovalForm } from "./intake-approval-form";
import { IntakeClinicalContent } from "./intake-clinical-content";

/** Tab Isian kuis (spec UI B bagian 4): ringkasan jawaban dan persetujuan ke data pasien. */
export function EncounterIntakeTab({ intake, approval }: { intake: EncounterIntake | null; approval: ReadyIntakeApproval | null }) {
  if (!intake) return <p className="text-sm text-muted-foreground">Tidak ada isian kuis untuk kunjungan ini.</p>;
  if (intake.state === "pending") return <p className="text-sm text-muted-foreground">Isian belum diisi pasien.</p>;

  const pageLink = (
    <Link href={`/admin/isian/${intake.id}`} className="text-sm underline underline-offset-4">
      Buka halaman isian
    </Link>
  );
  if (intake.state === "error") {
    return (
      <p className="text-sm text-destructive">
        {intake.message} {pageLink}
      </p>
    );
  }

  const heading = [
    intake.purposeLabel,
    intake.kind === "LENGKAP" ? "pasien baru" : "pasien lama",
    intake.submittedAt ? `dikirim ${formatShortIndonesianDate(intake.submittedAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{heading}</p>
      <IntakeClinicalContent clinical={intake.clinical} level={3} compact />
      {approval && (
        // key: formulir dibuat ulang dengan isi awal baru setelah router.refresh().
        <IntakeApprovalForm key={approval.patientVersion} intakeId={intake.id} approval={approval} />
      )}
      <p>{pageLink}</p>
    </div>
  );
}
