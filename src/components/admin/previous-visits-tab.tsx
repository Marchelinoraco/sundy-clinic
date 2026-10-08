"use client";

import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { formatIndonesianDate, formatShortIndonesianDate } from "@/lib/format";
import type { EncounterHistoryItem } from "@/server/encounter-read";
import { FoodRecallTable } from "./food-recall-table";
import { TextLink } from "./mui/links";

function Part({ label, text }: { label: string; text: string | null }) {
  return (
    <Box>
      <Typography variant="caption" component="p" sx={{ fontWeight: 500, color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>
        {text || "—"}
      </Typography>
    </Box>
  );
}

function VisitDetail({ visit }: { visit: EncounterHistoryItem }) {
  return (
    <Paper component="article" variant="outlined" aria-label={`Kunjungan ${formatIndonesianDate(visit.startAt)}`} sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 1 }}>
          <Typography variant="body2" component="span" sx={{ fontWeight: 500 }}>
            {formatIndonesianDate(visit.startAt)}
          </Typography>
          <Typography variant="caption" sx={{ color: "text.secondary" }}>
            {visit.branchName} · {visit.authorName}
          </Typography>
        </Stack>
        <Part label="S" text={visit.subjective} />
        {visit.vitalLines.length > 0 && <Part label="O" text={visit.vitalLines.join(" · ")} />}
        {visit.physicalExam && <Part label="Pemeriksaan fisik" text={visit.physicalExam} />}
        <Part label="A" text={visit.assessment} />
        <Part label="P" text={visit.plan} />
        {visit.treatments.length > 0 && (
          <Part
            label="Treatment"
            text={visit.treatments
              .map((row) => [row.serviceName, row.area, row.dose, row.performerName].filter(Boolean).join(" · "))
              .join("\n")}
          />
        )}
        {visit.foodRecall && visit.foodRecall.entries.length > 0 && (
          <Box
            component="details"
            sx={{ "& > summary": { cursor: "pointer", fontSize: "0.75rem", fontWeight: 500, color: "text.secondary" } }}
          >
            <summary>Food recall {visit.foodRecall.recallDateLabel}</summary>
            <FoodRecallTable entries={visit.foodRecall.entries} label={`Food recall ${visit.foodRecall.recallDateLabel}`} />
          </Box>
        )}
        {visit.addenda.map((addendum) => (
          <Typography
            key={addendum.id}
            variant="caption"
            component="p"
            sx={{ p: 1, borderRadius: 1, bgcolor: "action.hover" }}
          >
            <Box component="span" sx={{ color: "text.secondary" }}>
              Adendum {formatShortIndonesianDate(addendum.createdAt)} · {addendum.authorName}:
            </Box>{" "}
            {addendum.text}
          </Typography>
        ))}
      </Stack>
    </Paper>
  );
}

/** Tab Sebelumnya (spec UI B bagian 4): kunjungan terbaru terbuka, sisanya satu per satu. */
export function PreviousVisitsTab({ history, hasMore, patientId }: { history: EncounterHistoryItem[]; hasMore: boolean; patientId: string }) {
  const [openId, setOpenId] = useState<string | null>(history[0]?.id ?? null);
  if (history.length === 0) {
    return (
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        Belum ada kunjungan sebelumnya.
      </Typography>
    );
  }

  return (
    <Stack spacing={1}>
      <Stack component="ol" spacing={1} sx={{ listStyle: "none", m: 0, p: 0 }}>
        {history.map((visit) => (
          <li key={visit.id}>
            {visit.id === openId ? (
              <VisitDetail visit={visit} />
            ) : (
              <ButtonBase
                onClick={() => setOpenId(visit.id)}
                sx={{
                  display: "flex",
                  width: "100%",
                  justifyContent: "flex-start",
                  gap: 1.5,
                  px: 1.5,
                  py: 1,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  textAlign: "left",
                  fontSize: "0.875rem",
                  "&:hover": { bgcolor: "action.hover" },
                }}
              >
                <Box component="span" sx={{ width: 96, flexShrink: 0, color: "text.secondary" }}>
                  {formatShortIndonesianDate(visit.startAt)}
                </Box>
                <span>{visit.assessmentPreview ?? "—"}</span>
              </ButtonBase>
            )}
          </li>
        ))}
      </Stack>
      {hasMore && (
        <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
          Kunjungan lebih lama ada di{" "}
          <TextLink href={`/admin/pasien/${patientId}`} underline="always">
            Data pasien
          </TextLink>
          .
        </Typography>
      )}
    </Stack>
  );
}
