"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { BookingFormInitial } from "@/lib/booking-prefill";
import { formatShortIndonesianDate } from "@/lib/format";
import type { SlotOption } from "@/lib/slot";
import { combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import type { TransferInstruction } from "@/lib/transfer-instruction";
import { createAppointment, getTransferInstruction } from "@/server/appointment";
import type { PatientSummary } from "@/server/patient";
import { BookingCreatedPanel, type CreatedBooking } from "./booking-created-panel";
import {
  ADMIN_SOURCE_LABEL,
  ADMIN_SOURCES,
  BookingSummary,
  bookingSummaryItems,
  type AdminBookingSource,
} from "./booking-summary";
import { DateStrip } from "./date-strip";
import { SelectField } from "./mui/select-field";
import { PatientBookingInfo, PatientPicker } from "./patient-picker";
import { SlotPicker } from "./slot-picker";

export type BookingStaffOption = { id: string; name: string; role: "DOKTER" | "TERAPIS" };
export type BookingServiceOption = {
  id: string;
  name: string;
  durationMin: number;
  requiresDoctor: boolean;
};
export type BookingServiceGroup = { name: string; services: BookingServiceOption[] };

type Props = {
  branches: { id: string; name: string }[];
  staff: BookingStaffOption[];
  treatmentGroups: BookingServiceGroup[];
  /** Baris layanan "Konsultasi Dokter", agar konsultasi tetap tercatat sebagai layanan. */
  consultationServiceId: string | null;
  /** Tanggal hari ini dalam WITA, dihitung di server agar tidak bergantung jam perangkat. */
  today: string;
  /** Biaya booking dari Pengaturan, untuk ringkasan. Biaya yang tersimpan disalin server saat booking dibuat. */
  bookingFee: number;
  /** Isian awal dari dasbor atau Data Pasien (spec D 5.8); booking tetap dibuat lewat Buat Booking. */
  initial?: BookingFormInitial;
  /** Pesan singkat bila sebagian isian awal tidak lagi sah. */
  notice?: string | null;
};

type BookingKind = "KONSULTASI" | "TREATMENT";

const CONSULTATION_MINUTES = 30;

/**
 * Booking Baru (spec C1 bagian 3–4): langkah di kiri boleh diisi dalam urutan
 * apa pun; ringkasan di kanan menempel saat menggulir, lalu menampilkan panel
 * "Booking dibuat". Halaman tidak pindah setelah simpan.
 */
export function AppointmentForm({
  branches,
  staff,
  treatmentGroups,
  consultationServiceId,
  today,
  bookingFee,
  initial,
  notice,
}: Props) {
  const [patient, setPatient] = useState<PatientSummary | null>(initial?.patient ?? null);
  const [kind, setKind] = useState<BookingKind>(initial?.kind ?? "KONSULTASI");
  const [serviceId, setServiceId] = useState("");
  const [branchId, setBranchId] = useState(
    initial?.branchId && branches.some((b) => b.id === initial.branchId) ? initial.branchId : (branches[0]?.id ?? ""),
  );
  const [staffId, setStaffId] = useState(initial?.staffId ?? "");
  const [source, setSource] = useState<AdminBookingSource>("WHATSAPP");
  const [date, setDate] = useState(initial?.date ?? "");
  const [slot, setSlot] = useState<SlotOption | null>(initial?.slot ?? null);
  const [notes, setNotes] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [pending, startTransition] = useTransition();

  const treatment = treatmentGroups
    .flatMap((g) => g.services)
    .find((s) => s.id === serviceId);
  const durationMinutes = kind === "KONSULTASI" ? CONSULTATION_MINUTES : treatment?.durationMin;
  const needsDoctor = kind === "KONSULTASI" || treatment?.requiresDoctor === true;
  const eligibleStaff = staff.filter((s) => !needsDoctor || s.role === "DOKTER");

  // Tenaga yang sudah dipilih bisa menjadi tidak sah saat jenis/layanan
  // berganti (misal terapis, lalu layanan diganti ke Botox). Bila hanya ada
  // satu pilihan sah, langsung dipakai — satu klik lebih sedikit di telepon.
  const effectiveStaffId = eligibleStaff.some((s) => s.id === staffId)
    ? staffId
    : eligibleStaff.length === 1
      ? eligibleStaff[0].id
      : "";

  const canPickDate = Boolean(effectiveStaffId && branchId && durationMinutes);
  // Setelah booking dibuat semua isian dikunci. Fieldset mengunci tombol dan isian biasa;
  // Select Radix terbuka lewat pointerdown, jadi perlu dikunci lewat prop disabled-nya sendiri.
  const locked = created !== null;
  const serviceName = kind === "KONSULTASI" ? "Konsultasi Dokter" : (treatment?.name ?? null);
  const staffName = staff.find((s) => s.id === effectiveStaffId)?.name ?? null;
  const branchName = branches.find((b) => b.id === branchId)?.name ?? null;

  // Layanan, tenaga, atau cabang berganti: strip dihitung ulang dari kuncinya
  // sendiri, dan jam yang sudah dipilih dikosongkan.
  function resetSlot() {
    setSlot(null);
  }

  function startNew() {
    setCreated(null);
    setPatient(null);
    setKind("KONSULTASI");
    setServiceId("");
    setStaffId("");
    setDate("");
    setSlot(null);
    setNotes("");
    setRefreshKey((k) => k + 1);
    // Sumber dan cabang tetap: admin biasanya mencatat beberapa booking WA berturut-turut.
  }

  function handleSubmit() {
    if (!patient) {
      toast.error("Pilih atau buat pasien terlebih dahulu.");
      return;
    }
    if (kind === "TREATMENT" && !treatment) {
      toast.error("Pilih layanan treatment.");
      return;
    }
    if (!effectiveStaffId || !slot) {
      toast.error("Pilih tenaga, tanggal, dan jam terlebih dahulu.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await createAppointment({
          patientId: patient.id,
          branchId,
          staffId: effectiveStaffId,
          serviceId: kind === "KONSULTASI" ? consultationServiceId : serviceId,
          type: kind,
          startAt: slot.startAt,
          endAt: slot.endAt,
          source,
          notes: notes.trim() || undefined,
        });
        if (!result.ok) {
          toast.error(result.error);
          // Jam yang baru saja direbut booking lain harus hilang dari pilihan.
          setSlot(null);
          setRefreshKey((k) => k + 1);
          return;
        }

        // Booking sudah tersimpan; instruksi yang gagal dimuat tidak membatalkannya.
        let instruction: TransferInstruction | null = null;
        let instructionFailed = false;
        try {
          const transfer = await getTransferInstruction(result.data.id);
          if (transfer.ok) instruction = transfer.data;
          else instructionFailed = true;
        } catch {
          instructionFailed = true;
        }
        setCreated({
          id: result.data.id,
          code: result.data.code,
          date: witaDateString(result.data.startAt),
          startAt: result.data.startAt,
          instruction,
          instructionFailed,
        });
      } catch {
        toast.error("Gagal membuat booking. Coba lagi.");
      }
    });
  }

  const sectionTitle = { fontSize: "0.875rem", fontWeight: 500 } as const;
  const hint = (text: string) => (
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      {text}
    </Typography>
  );

  return (
    <Box sx={{ display: "grid", gap: 3, alignItems: { lg: "start" }, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 20rem" } }}>
      <Box
        component="fieldset"
        disabled={locked}
        sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, "&:disabled": { opacity: 0.6 } }}
      >
        {notice && !locked && (
          <Box
            component="p"
            role="status"
            sx={{ m: 0, borderRadius: 1.5, border: 1, borderColor: "primary.main", bgcolor: "rgba(var(--mui-palette-primary-mainChannel) / 0.1)", p: 1.5, fontSize: "0.875rem" }}
          >
            {notice}
          </Box>
        )}
        <Stack component="section" spacing={1}>
          <Typography component="h2" sx={sectionTitle}>
            1 · Pasien
          </Typography>
          {patient ? (
            <Paper variant="outlined" sx={{ p: 1.5, fontSize: "0.875rem", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
              <span>
                <Box component="span" sx={{ fontWeight: 500 }}>
                  {patient.name}
                </Box>{" "}
                <Box component="span" sx={{ color: "text.secondary" }}>
                  ({patient.medicalRecordNumber} · {patient.whatsapp})
                </Box>
                <PatientBookingInfo patient={patient} />
              </span>
              <Button type="button" variant="text" size="small" onClick={() => setPatient(null)}>
                Ganti pasien
              </Button>
            </Paper>
          ) : (
            <PatientPicker onSelect={setPatient} />
          )}
        </Stack>

        <Stack component="section" spacing={1.5}>
          <Typography component="h2" sx={sectionTitle}>
            2 · Layanan & tenaga
          </Typography>
          <Box role="group" aria-label="Jenis booking" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {(["KONSULTASI", "TREATMENT"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                size="small"
                variant={kind === k ? "contained" : "outlined"}
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  resetSlot();
                }}
              >
                {k === "KONSULTASI" ? "Konsultasi Dokter (30 menit)" : "Treatment"}
              </Button>
            ))}
          </Box>

          {kind === "TREATMENT" && (
            <SelectField
              id="booking-service"
              label="Layanan"
              value={serviceId}
              disabled={locked}
              onChange={(value) => {
                setServiceId(value);
                resetSlot();
              }}
              fullWidth={false}
              sx={{ width: { xs: "100%", sm: 384 } }}
            >
              <option value="" disabled>
                Pilih layanan
              </option>
              {treatmentGroups.map((group) => (
                <optgroup key={group.name} label={group.name}>
                  {group.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.durationMin} menit{s.requiresDoctor ? " · dokter" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </SelectField>
          )}

          <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
            {branches.length > 1 && (
              <SelectField
                id="booking-branch"
                label="Cabang"
                value={branchId}
                disabled={locked}
                onChange={(value) => {
                  setBranchId(value);
                  resetSlot();
                }}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </SelectField>
            )}

            <SelectField
              id="booking-staff"
              label="Tenaga"
              value={effectiveStaffId}
              disabled={locked}
              onChange={(value) => {
                setStaffId(value);
                resetSlot();
              }}
              helperText={needsDoctor ? "Hanya dokter yang ditampilkan." : undefined}
            >
              <option value="" disabled>
                Pilih tenaga
              </option>
              {eligibleStaff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </SelectField>
          </Box>

          <Stack spacing={0.5}>
            <Typography id="booking-source-label" variant="body2" sx={{ fontWeight: 500 }}>
              Sumber booking
            </Typography>
            <Box role="group" aria-labelledby="booking-source-label" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {ADMIN_SOURCES.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="small"
                  variant={source === value ? "contained" : "outlined"}
                  aria-pressed={source === value}
                  onClick={() => setSource(value)}
                >
                  {ADMIN_SOURCE_LABEL[value]}
                </Button>
              ))}
            </Box>
          </Stack>
        </Stack>

        <Stack component="section" spacing={1.5}>
          <Typography component="h2" sx={sectionTitle}>
            3 · Tanggal
          </Typography>
          {canPickDate ? (
            <DateStrip
              staffId={effectiveStaffId}
              branchId={branchId}
              durationMinutes={durationMinutes!}
              today={today}
              selected={date}
              onSelect={(d) => {
                setDate(d);
                resetSlot();
              }}
              refreshKey={refreshKey}
            />
          ) : (
            hint("Pilih layanan dan tenaga dulu.")
          )}
        </Stack>

        <Stack component="section" spacing={1.5}>
          <Typography component="h2" sx={sectionTitle}>
            4 · Jam
          </Typography>
          {canPickDate && date ? (
            <SlotPicker
              staffId={effectiveStaffId}
              branchId={branchId}
              date={date}
              durationMinutes={durationMinutes!}
              selected={slot}
              onSelect={setSlot}
              refreshKey={refreshKey}
            />
          ) : (
            hint("Pilih tanggal dulu.")
          )}
        </Stack>

        <Box component="section">
          <TextField
            id="booking-notes"
            label="Catatan (opsional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Misal: keluhan utama, permintaan khusus"
            fullWidth
          />
        </Box>
      </Box>

      <Box component="aside" aria-label="Ringkasan booking" sx={{ display: "flex", flexDirection: "column", gap: 2, position: { lg: "sticky" }, top: { lg: 16 } }}>
        <Paper variant="outlined" sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
          <Typography component="h2" sx={{ fontWeight: 500 }}>
            Ringkasan
          </Typography>
          <BookingSummary
            items={bookingSummaryItems({
              patientName: patient?.name ?? null,
              serviceName,
              startAt: slot?.startAt ?? null,
              staffName,
              branchName,
              source,
              bookingFee,
            })}
          />
          {!created && (
            <Button type="button" variant="contained" fullWidth disabled={pending} onClick={handleSubmit}>
              {pending ? "Menyimpan…" : "Buat Booking"}
            </Button>
          )}
        </Paper>
        {created && (
          <BookingCreatedPanel
            booking={created}
            dateLabel={formatShortIndonesianDate(combineWitaDateAndMinutes(created.date, 12 * 60))}
            onNew={startNew}
          />
        )}
      </Box>
    </Box>
  );
}
