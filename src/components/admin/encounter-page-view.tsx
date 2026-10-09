import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { BiaVisitView } from "@/server/bia-read";
import type { EncounterDetail } from "@/server/encounter-read";
import { EncounterWorkspace } from "./encounter-workspace";
import { TextLink } from "./mui/links";
import { StatusChip } from "./mui/status-chip";

/** Halaman kunjungan (spec UI B bagian 3): kepala satu baris dan ruang kerja dua kolom. */
export function EncounterPageView({ encounter, bia, canWrite }: { encounter: EncounterDetail; bia: BiaVisitView; canWrite: boolean }) {
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
    <Stack spacing={2} sx={{ maxWidth: 1280 }}>
      <Paper
        component="section"
        variant="outlined"
        sx={{ px: 2, py: 1.5, display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 1.5, rowGap: 0.5, fontSize: "0.875rem" }}
      >
        <Typography component="h2" sx={{ fontSize: "1.125rem", fontWeight: 500 }}>
          {patient.name}
        </Typography>
        <StatusChip label={isFinal ? "Final" : "Draf"} tone={isFinal ? "success" : "neutral"} />
        {appointment.channel === "ONLINE" && <StatusChip label="Konsultasi online" tone="neutral" />}
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {summary}
        </Typography>
        <Typography component="span" sx={{ fontFamily: "ui-monospace, monospace", fontSize: "0.75rem", color: "text.secondary" }}>
          {appointment.code}
        </Typography>
        <TextLink href={`/admin/pasien/${patient.id}`} underline="always" sx={{ ml: "auto" }}>
          Data pasien
        </TextLink>
      </Paper>
      <EncounterWorkspace encounter={encounter} bia={bia} canWrite={canWrite} />
    </Stack>
  );
}
