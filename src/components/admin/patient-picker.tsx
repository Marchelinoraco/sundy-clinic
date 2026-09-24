"use client";

import { useEffect, useRef, useState } from "react";
import type { Patient } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { searchPatients } from "@/server/patient";
import { NewPatientForm } from "./new-patient-form";

type SearchState = { query: string; patients: Patient[] };

export function PatientPicker({ onSelect }: { onSelect: (patient: Patient) => void }) {
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
    <div className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="patient-search">Cari pasien (nama, WhatsApp, atau nomor RM)</Label>
        <Input
          id="patient-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ketik untuk mencari…"
          autoComplete="off"
        />
      </div>

      {trimmed !== "" && !settled && <p className="text-sm text-muted-foreground">Mencari…</p>}

      {settled && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Tidak ada pasien yang cocok.</p>
      )}

      {results.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {results.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => onSelect(patient)}
              >
                <span className="font-medium">{patient.name}</span>
                <span className="ml-2 text-muted-foreground">
                  {patient.medicalRecordNumber} · {patient.whatsapp}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <NewPatientForm onCreated={onSelect} onPickExisting={onSelect} />
    </div>
  );
}
