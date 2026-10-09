"use client";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { useId, useState } from "react";
import { initialContextTab, type ContextTab, type VitalKey } from "@/lib/encounter";
import type { BiaVisitView } from "@/server/bia-read";
import type { EncounterDetail } from "@/server/encounter-read";
import { BiaTab } from "./bia/bia-tab";
import { BiaTrendChart } from "./bia/bia-trend-chart";
import { EncounterFoodRecallTab, type SubjectiveCopy } from "./encounter-food-recall-tab";
import { EncounterIntakeTab } from "./encounter-intake-tab";
import { EncounterWarningsBox } from "./encounter-warnings";
import { PreviousVisitsTab } from "./previous-visits-tab";
import { VitalsTrendTab } from "./vitals-trend-tab";

const TABS: { key: ContextTab; label: string }[] = [
  { key: "intake", label: "Isian kuis" },
  { key: "foodRecall", label: "Food recall" },
  { key: "bia", label: "BIA" },
  { key: "previous", label: "Sebelumnya" },
  { key: "trend", label: "Tren" },
];

/**
 * Kolom kiri halaman kunjungan (spec UI B bagian 4): peringatan selalu di atas,
 * lalu tab Isian kuis / Sebelumnya / Tren. Di layar sempit tab bisa dilipat.
 */
export function EncounterContextPanel({
  encounter,
  bia,
  currentVitals,
  canEditFoodRecall,
  copyToSubjective,
  onBiaUnsavedChange,
}: {
  encounter: EncounterDetail;
  /** Hasil BIA kunjungan ini dan titik grafik pasien (spec hasil BIA 6.2). */
  bia: BiaVisitView;
  /** Angka vital formulir saat ini, untuk baris "Kunjungan ini" di Tren. */
  currentVitals: Record<VitalKey, number | null>;
  /** Catatan masih draf dan staf memegang record:write. */
  canEditFoodRecall?: boolean;
  /** Jalan ke kolom S (hanya saat formulir draf terbuka). */
  copyToSubjective?: SubjectiveCopy;
  /** Angka BIA yang diketik tetapi belum disimpan, untuk peringatan di dialog Finalisasi. */
  onBiaUnsavedChange?: (unsaved: boolean) => void;
}) {
  const id = useId();
  const [tab, setTab] = useState<ContextTab>(() =>
    initialContextTab({
      hasIntake: encounter.intake !== null,
      hasHistory: encounter.history.length > 0,
      hasFilledFoodRecall: encounter.foodRecall.state === "FILLED" && encounter.status === "DRAF",
    }),
  );
  const trendSource = encounter.history.map((visit) => ({ date: visit.startAt, vitals: visit.vitals }));

  return (
    <Stack spacing={2}>
      <EncounterWarningsBox warnings={encounter.warnings} />
      <Box component="details" open sx={{ "& > summary": { cursor: "pointer", fontSize: "0.875rem", fontWeight: 500, mb: 1.5, display: { lg: "none" } } }}>
        <summary>Isian, BIA, kunjungan sebelumnya, dan tren</summary>
        <Tabs
          value={tab}
          onChange={(_, next: ContextTab) => setTab(next)}
          aria-label="Konteks kunjungan"
          variant="scrollable"
          allowScrollButtonsMobile
          textColor="inherit"
          sx={{ mb: 1.5, minHeight: 40, "& .MuiTab-root": { minHeight: 40, minWidth: 0, py: 1, px: 1.25 } }}
        >
          {TABS.map((item) => (
            <Tab key={item.key} value={item.key} label={item.label} id={`${id}-${item.key}`} aria-controls={`${id}-${item.key}-panel`} />
          ))}
        </Tabs>
        {/* Semua panel tetap terpasang dan yang tidak aktif disembunyikan: berpindah tab
            tidak boleh membuang suntingan di kotak persetujuan atau tabel yang sudah dibuka. */}
        {TABS.map((item) => (
          <Paper
            key={item.key}
            variant="outlined"
            role="tabpanel"
            id={`${id}-${item.key}-panel`}
            aria-labelledby={`${id}-${item.key}`}
            hidden={tab !== item.key}
            sx={{ p: 2 }}
          >
            {item.key === "intake" && <EncounterIntakeTab intake={encounter.intake} approval={encounter.approval} />}
            {item.key === "foodRecall" && (
              <EncounterFoodRecallTab
                foodRecall={encounter.foodRecall}
                appointmentCode={encounter.appointment.code}
                patientName={encounter.patient.name}
                editable={canEditFoodRecall ?? false}
                copy={copyToSubjective}
              />
            )}
            {item.key === "bia" && <BiaTab bia={bia} appointmentId={encounter.appointment.id} onUnsavedChange={onBiaUnsavedChange} />}
            {item.key === "previous" && (
              <PreviousVisitsTab history={encounter.history} hasMore={encounter.hasMoreHistory} patientId={encounter.patient.id} />
            )}
            {item.key === "trend" && (
              <Stack spacing={2}>
                <VitalsTrendTab current={currentVitals} history={trendSource} />
                <Typography component="h3" variant="subtitle2">
                  Komposisi tubuh (BIA)
                </Typography>
                <BiaTrendChart points={bia.points} />
              </Stack>
            )}
          </Paper>
        ))}
      </Box>
    </Stack>
  );
}
