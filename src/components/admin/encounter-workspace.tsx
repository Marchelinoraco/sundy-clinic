"use client";

import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRef, useState } from "react";
import { formatIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import type { BiaVisitView } from "@/server/bia-read";
import type { EncounterDetail } from "@/server/encounter-read";
import { AddendumForm } from "./addendum-form";
import { AuditTrail } from "./audit-trail";
import { EncounterContextPanel } from "./encounter-context-panel";
import type { SubjectiveCopy } from "./encounter-food-recall-tab";
import { EncounterForm, type SubjectiveHandle } from "./encounter-form";
import { EncounterRecord } from "./encounter-record";

/**
 * Ruang kerja kunjungan (spec UI B bagian 3): konteks di kiri yang tetap di
 * tempat, catatan di kanan dengan bar aksi yang menempel. Angka vital formulir
 * dipegang di sini agar tab Tren ikut berubah saat dokter mengetik.
 *
 * Jangan diberi key berdasarkan versi: router.refresh() (mis. setelah
 * persetujuan isian) tidak boleh me-remount formulir yang sedang diketik.
 */
export function EncounterWorkspace({ encounter, bia, canWrite }: { encounter: EncounterDetail; bia: BiaVisitView; canWrite: boolean }) {
  const [currentVitals, setCurrentVitals] = useState(encounter.vitals);
  const isFinal = encounter.status === "FINAL";
  const editable = !isFinal && canWrite;
  const weightHistory = encounter.history.map((visit) => ({ date: visit.startAt, vitals: visit.vitals }));
  const subjectiveRef = useRef<SubjectiveHandle>(null);
  const copyToSubjective: SubjectiveCopy | undefined = editable
    ? {
        has: (text) => subjectiveRef.current?.text().includes(text) ?? false,
        append: (block) => subjectiveRef.current?.append(block) ?? false,
      }
    : undefined;

  return (
    <Box sx={{ display: { lg: "grid" }, gridTemplateColumns: { lg: "minmax(0, 2fr) minmax(0, 3fr)" }, gap: 3, alignItems: { lg: "start" } }}>
      {/* Bilah atas admin menempel setinggi 56 px, jadi kolom konteks menempel di bawahnya. */}
      <Box
        component="aside"
        aria-label="Konteks kunjungan"
        sx={{
          mb: { xs: 3, lg: 0 },
          position: { lg: "sticky" },
          top: { lg: 72 },
          maxHeight: { lg: "calc(100svh - 6rem)" },
          overflowY: { lg: "auto" },
          pr: { lg: 0.5 },
        }}
      >
        <EncounterContextPanel
          encounter={encounter}
          bia={bia}
          currentVitals={editable ? currentVitals : encounter.vitals}
          canEditFoodRecall={editable}
          copyToSubjective={copyToSubjective}
        />
      </Box>

      <Stack spacing={3} sx={{ minWidth: 0 }}>
        {editable ? (
          <EncounterForm
            encounterId={encounter.id}
            initialVersion={encounter.version}
            initialDraft={encounter.draft}
            options={encounter.options}
            weightHistory={weightHistory}
            onVitalsChange={setCurrentVitals}
            subjectiveRef={subjectiveRef}
          />
        ) : (
          <EncounterRecord encounter={encounter} />
        )}

        {isFinal && (
          <Stack component="section" aria-labelledby="adendum" spacing={1.5}>
            <Typography id="adendum" component="h2" sx={{ fontSize: "1rem", fontWeight: 500 }}>
              Adendum
            </Typography>
            {encounter.addenda.length === 0 ? (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                Belum ada adendum.
              </Typography>
            ) : (
              <Stack component="ol" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
                {encounter.addenda.map((addendum) => (
                  <Paper key={addendum.id} component="li" variant="outlined" sx={{ p: 1.5 }}>
                    <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
                      {addendum.text}
                    </Typography>
                    <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
                      {addendum.authorName} · {formatIndonesianDate(addendum.createdAt)},{" "}
                      {minutesToTimeLabel(witaMinutesOfDay(addendum.createdAt))} WITA
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            )}
            {canWrite && <AddendumForm encounterId={encounter.id} />}
          </Stack>
        )}

        {encounter.trail && <AuditTrail rows={encounter.trail} />}

        {isFinal && encounter.finalized && (
          <Box
            sx={{
              position: "sticky",
              bottom: 0,
              zIndex: 10,
              borderTop: 1,
              borderColor: "divider",
              bgcolor: "rgba(var(--mui-palette-background-defaultChannel) / 0.95)",
              backdropFilter: "blur(8px)",
              py: 1.5,
              fontSize: "0.875rem",
              color: "text.secondary",
            }}
          >
            Final · difinalisasi oleh {encounter.finalized.byName}, {formatIndonesianDate(encounter.finalized.at)}{" "}
            {minutesToTimeLabel(witaMinutesOfDay(encounter.finalized.at))} WITA
          </Box>
        )}
      </Stack>
    </Box>
  );
}
