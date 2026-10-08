import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatShortIndonesianDate } from "@/lib/format";
import type { EncounterIntake } from "@/server/encounter-read";
import type { ReadyIntakeApproval } from "@/server/intake-clinical";
import { IntakeApprovalForm } from "./intake-approval-form";
import { IntakeClinicalContent } from "./intake-clinical-content";
import { TextLink } from "./mui/links";

/** Tab Isian kuis (spec UI B bagian 4): ringkasan jawaban dan persetujuan ke data pasien. */
export function EncounterIntakeTab({ intake, approval }: { intake: EncounterIntake | null; approval: ReadyIntakeApproval | null }) {
  if (!intake) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Tidak ada isian kuis untuk kunjungan ini.
      </Typography>
    );
  }
  if (intake.state === "pending") {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Isian belum diisi pasien.
      </Typography>
    );
  }

  const pageLink = (
    <TextLink href={`/admin/isian/${intake.id}`} underline="always" sx={{ fontSize: "0.875rem" }}>
      Buka halaman isian
    </TextLink>
  );
  if (intake.state === "error") {
    return (
      <Typography variant="body2" sx={{ color: "error.main" }}>
        {intake.message} {pageLink}
      </Typography>
    );
  }

  const heading = [
    intake.purposeLabel,
    intake.kind === "LENGKAP" ? "pasien baru" : "pasien lama",
    intake.submittedAt ? `dikirim ${formatShortIndonesianDate(intake.submittedAt)}` : null,
    // Spec UI B bagian 4: status ini ikut berubah setelah dokter menyetujui isian.
    intake.needsApproval ? "belum disetujui ke data pasien" : "sudah disetujui ke data pasien",
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Stack spacing={2}>
      <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
        {heading}
      </Typography>
      <IntakeClinicalContent clinical={intake.clinical} level={3} compact />
      {approval && (
        // key: formulir dibuat ulang dengan isi awal baru setelah router.refresh().
        <IntakeApprovalForm key={approval.patientVersion} intakeId={intake.id} approval={approval} />
      )}
      <Typography component="p">{pageLink}</Typography>
    </Stack>
  );
}
