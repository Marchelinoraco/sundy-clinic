import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { IntakeDetail } from "@/server/intake";
import { IntakeApprovalForm } from "./intake-approval-form";
import { IntakeClinicalContent } from "./intake-clinical-content";
import { TextLink } from "./mui/links";
import { StatusChip } from "./mui/status-chip";

const STATUS_LABEL: Record<IntakeDetail["status"], string> = {
  MENUNGGU_DIISI: "Menunggu diisi pasien",
  TERISI: "Terisi — belum diperiksa dokter",
  DIPERIKSA: "Sudah diperiksa dokter",
};

export function IntakeView({ intake }: { intake: IntakeDetail }) {
  const { appointment, identity, clinical } = intake;
  const time = minutesToTimeLabel(witaMinutesOfDay(appointment.startAt));

  return (
    <Box sx={{ maxWidth: 768, display: "flex", flexDirection: "column", gap: 3 }}>
      <Paper component="section" variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 0.5, fontSize: "0.875rem" }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap", alignItems: "center" }}>
          <Box component="span" sx={{ fontFamily: "ui-monospace, monospace" }}>
            {appointment.code}
          </Box>
          <StatusChip label={STATUS_LABEL[intake.status]} />
          <StatusChip label={intake.kind === "LENGKAP" ? "Kuis lengkap" : "Kuis pendek"} tone="info" />
          {intake.needsFullIntake && <StatusChip label="Belum punya isian lengkap" />}
        </Stack>
        <Box component="p" sx={{ m: 0 }}>
          {appointment.serviceName} · {appointment.staffName} · {formatIndonesianDate(appointment.startAt)}, {time} WITA
        </Box>
        <Box component="p" sx={{ m: 0 }}>
          Pasien:{" "}
          {intake.patient ? (
            <TextLink href={`/admin/pasien/${intake.patient.id}`} underline="always">
              {intake.patient.name} ({intake.patient.medicalRecordNumber})
            </TextLink>
          ) : (
            <StatusChip label="Belum dicocokkan" />
          )}
        </Box>
        {intake.review && (
          <Box component="p" sx={{ m: 0, color: "text.secondary" }}>
            Diperiksa oleh {intake.review.reviewerName}, {formatIndonesianDate(intake.review.reviewedAt)}
          </Box>
        )}
      </Paper>

      <Box component="section" sx={{ fontSize: "0.875rem" }}>
        <Typography component="h2" sx={{ fontSize: "1rem", fontWeight: 500, mb: 0.5 }}>
          Data diri dari isian
        </Typography>
        <Box component="p" sx={{ m: 0 }}>
          {identity.name ?? "—"} · {identity.whatsapp ?? "—"} · lahir {identity.birthDateLabel ?? "—"}
        </Box>
        {identity.genderLabel && (
          <Box component="p" sx={{ m: 0 }}>
            {identity.genderLabel} · {identity.occupation ?? "—"}
          </Box>
        )}
        {identity.address && (
          <Box component="p" sx={{ m: 0 }}>
            {identity.address}
          </Box>
        )}
      </Box>

      {!clinical ? (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Pasien belum mengisi kuis.
        </Typography>
      ) : (
        <>
          <IntakeClinicalContent clinical={clinical} />

          {intake.approval?.state === "ready" && (
            // key: formulir dibuat ulang dengan isi awal baru setelah router.refresh().
            <IntakeApprovalForm key={intake.approval.patientVersion} intakeId={intake.id} approval={intake.approval} />
          )}
          {intake.approval?.state === "needs-match" && (
            <Paper variant="outlined" sx={{ p: 2, fontSize: "0.875rem", color: "text.secondary" }}>
              Cocokkan booking ini dengan pasien di menu Booking sebelum menyetujui isian ke data pasien.
            </Paper>
          )}
        </>
      )}
    </Box>
  );
}
