import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { saveFoodRecallByNurse } from "@/server/food-recall-admin";
import type { NurseVisit } from "@/server/nurse";
import { BiaTab } from "../bia/bia-tab";
import { EncounterFoodRecallTab } from "../encounter-food-recall-tab";
import { SectionCard } from "../page-layout";
import { NurseVitalsCard } from "./nurse-vitals-card";

/**
 * Halaman Tangani perawat (spec peran perawat 7): kepala seperlunya, alergi, angka vital (spec vital perawat VP1), food
 * recall, dan BIA kunjungan ini.
 * Tidak ada catatan dokter, diagnosis, resep, riwayat, isian kuis, BIA lama, atau tagihan.
 */
export function NurseVisitView({ visit }: { visit: NurseVisit }) {
  const time = minutesToTimeLabel(witaMinutesOfDay(visit.startAt));
  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography component="h1" variant="h5">
          {visit.patient.name}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          {visit.patient.medicalRecordNumber} · {visit.code}
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary" }}>
          Hari ini {time} · {visit.serviceName} · {visit.staffName} · {visit.branchName}
        </Typography>
      </Stack>

      {visit.patient.allergies && (
        <Paper
          component="section"
          aria-labelledby="peringatan-perawat"
          variant="outlined"
          sx={{ p: 2, borderColor: "warning.main", bgcolor: "rgba(var(--mui-palette-warning-mainChannel) / 0.08)" }}
        >
          <Typography id="peringatan-perawat" component="h2" sx={{ fontSize: "1rem", fontWeight: 500 }}>
            Peringatan
          </Typography>
          <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
            Alergi: {visit.patient.allergies}
          </Typography>
        </Paper>
      )}

      <SectionCard title="Angka vital">
        <NurseVitalsCard appointmentId={visit.appointmentId} vitals={visit.vitals} />
      </SectionCard>

      <SectionCard title="Food recall">
        <EncounterFoodRecallTab
          foodRecall={visit.foodRecall}
          appointmentCode={visit.code}
          patientName={visit.patient.name}
          editable
          save={saveFoodRecallByNurse}
          customerLink={false}
        />
      </SectionCard>

      <SectionCard title="BIA">
        <BiaTab bia={visit.bia} appointmentId={visit.appointmentId} />
      </SectionCard>
    </Stack>
  );
}
