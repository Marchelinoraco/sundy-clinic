"use client";

import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useEffect, useRef, useState } from "react";
import { formatShortIndonesianDate } from "@/lib/format";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { searchPatients, type PatientSummary } from "@/server/patient";
import { NewPatientForm } from "./new-patient-form";

/** Kunjungan terakhir dan booking aktif berikutnya: booking ganda ketahuan sebelum dibuat (spec C1 bagian 3). */
export function PatientBookingInfo({ patient }: { patient: PatientSummary }) {
  return (
    <Typography variant="caption" component="span" sx={{ display: "block", color: "text.secondary" }}>
      Kunjungan terakhir {patient.lastVisitAt ? formatShortIndonesianDate(patient.lastVisitAt) : "belum pernah"}
      {patient.nextBookingAt && (
        <>
          {" · "}
          <Box component="span" sx={{ fontWeight: 500, color: "warning.main" }}>
            booking berikutnya {formatShortIndonesianDate(patient.nextBookingAt)}{" "}
            {minutesToTimeLabel(witaMinutesOfDay(patient.nextBookingAt))}
          </Box>
        </>
      )}
    </Typography>
  );
}

type SearchState = { query: string; patients: PatientSummary[] };

export function PatientPicker({ onSelect }: { onSelect: (patient: PatientSummary) => void }) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchState>({ query: "", patients: [] });
  const latestRequest = useRef(0);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const requestId = ++latestRequest.current;
    const timer = setTimeout(async () => {
      try {
        const patients = await searchPatients(trimmed);
        // Jawaban untuk ketikan lama bisa tiba setelah jawaban untuk ketikan
        // baru; hanya permintaan terakhir yang boleh mengisi daftar.
        if (requestId === latestRequest.current) setSearch({ query: trimmed, patients });
      } catch {
        if (requestId === latestRequest.current) setSearch({ query: trimmed, patients: [] });
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  const settled = trimmed !== "" && search.query === trimmed;
  const results = settled ? search.patients : [];

  return (
    <Stack spacing={1.5}>
      <Autocomplete<PatientSummary, false, false, false>
        id="patient-search"
        options={results}
        value={null}
        inputValue={query}
        onInputChange={(_, next, reason) => reason !== "reset" && setQuery(next)}
        onChange={(_, patient) => patient && onSelect(patient)}
        // Penyaringan dilakukan server (nama, WhatsApp, RM); jangan disaring ulang di sini.
        filterOptions={(options) => options}
        getOptionLabel={(patient) => patient.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        open={trimmed !== ""}
        loading={trimmed !== "" && !settled}
        loadingText="Mencari…"
        noOptionsText="Tidak ada pasien yang cocok."
        renderOption={({ key, ...props }, patient) => (
          <li key={key} {...props}>
            <span>
              <Typography component="span" sx={{ fontWeight: 500 }}>
                {patient.name}
              </Typography>
              <Typography component="span" sx={{ ml: 1, color: "text.secondary" }}>
                {patient.medicalRecordNumber} · {patient.whatsapp}
              </Typography>
              <PatientBookingInfo patient={patient} />
            </span>
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Cari pasien (nama, WhatsApp, atau nomor RM)" placeholder="Ketik untuk mencari…" />}
      />
      <NewPatientForm onCreated={onSelect} onPickExisting={onSelect} />
    </Stack>
  );
}
