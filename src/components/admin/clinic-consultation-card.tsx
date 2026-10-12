"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CONSULTATION_DURATIONS } from "@/lib/booking-rules";
import { updateClinicConsultationDuration } from "@/server/service-admin";
import { SelectField } from "./mui/select-field";
import { SectionCard } from "./page-layout";

/** Lama konsultasi dokter di klinik (layanan Konsultasi Dokter). Harganya tetap diatur di tabel di bawah. */
export function ClinicConsultationCard({ minutes }: { minutes: number }) {
  const router = useRouter();
  const [value, setValue] = useState(minutes);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateClinicConsultationDuration(value);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`Lama konsultasi klinik: ${value} menit.`);
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  return (
    <SectionCard
      title="Konsultasi di klinik"
      description="Jam mulai ditawarkan tiap 15 menit di Booking Baru dan situs. Booking yang sudah ada tidak berubah."
    >
      <Stack spacing={2}>
        <Typography variant="body2">
          Lama konsultasi sekarang: <strong>{minutes} menit</strong>
        </Typography>
        <Box sx={{ maxWidth: { sm: 240 } }}>
          <SelectField id="clinic-consultation-minutes" label="Lama konsultasi" value={String(value)} onChange={(next) => setValue(Number(next))}>
            {CONSULTATION_DURATIONS.map((option) => (
              <option key={option} value={option}>
                {option} menit
              </option>
            ))}
          </SelectField>
        </Box>
        {error && <Alert severity="error">{error}</Alert>}
        <Box>
          <Button type="button" variant="contained" onClick={save} disabled={pending}>
            Simpan
          </Button>
        </Box>
      </Stack>
    </SectionCard>
  );
}
