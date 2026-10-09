"use client";

import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatRupiah } from "@/lib/format";
import {
  EMPTY_WINDOW_DRAFT,
  ONLINE_MAX_DAYS_AHEAD,
  onlineTotal,
  windowDraftsError,
  windowLabel,
  type WindowDraft,
} from "@/lib/online-consultation";
import { bookingFeeFor } from "@/lib/payment";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import type { TransferInstruction } from "@/lib/transfer-instruction";
import { getTransferInstruction } from "@/server/appointment";
import { createOnlineAppointment } from "@/server/online-consultation";
import type { PatientSummary } from "@/server/patient";
import { BookingCreatedPanel, type CreatedBooking } from "./booking-created-panel";
import { BookingSummary, type SummaryItem } from "./booking-summary";
import { ContactWindowsFields } from "./contact-windows-fields";
import { SelectField } from "./mui/select-field";
import { PatientBookingInfo, PatientPicker } from "./patient-picker";

type OnlineSource = "WHATSAPP" | "TELEPON";
const SOURCE_LABEL: Record<OnlineSource, string> = { WHATSAPP: "WhatsApp", TELEPON: "Telepon" };

/**
 * Booking Baru versi konsultasi online (spec konsultasi online 5.1): pasien, dokter, sumber,
 * dan 1–3 rentang waktu luang. Tanpa pilihan cabang, tanggal, atau jam klinik.
 */
export function OnlineAppointmentForm({
  doctors,
  today,
  maxDate = addDaysToDateString(today, ONLINE_MAX_DAYS_AHEAD),
  bookingFee,
  servicePrice,
  initialPatient = null,
}: {
  doctors: { id: string; name: string }[];
  /** Hari ini dalam WITA, dari server. */
  today: string;
  maxDate?: string;
  /** Biaya booking dari Pengaturan; yang tersimpan disalin server saat booking dibuat. */
  bookingFee: number;
  /** Harga Konsultasi Online saat ini; yang tersimpan disalin server. */
  servicePrice: number;
  initialPatient?: PatientSummary | null;
}) {
  const [patient, setPatient] = useState<PatientSummary | null>(initialPatient);
  const [staffId, setStaffId] = useState(doctors.length === 1 ? doctors[0].id : "");
  const [source, setSource] = useState<OnlineSource>("WHATSAPP");
  const [windows, setWindows] = useState<WindowDraft[]>([EMPTY_WINDOW_DRAFT]);
  const [notes, setNotes] = useState("");
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [pending, startTransition] = useTransition();

  const fee = bookingFeeFor(source, bookingFee);
  const total = onlineTotal({ bookingFee: fee, servicePrice });
  const locked = created !== null;
  const doctorName = doctors.find((d) => d.id === staffId)?.name ?? null;
  const windowText = windows
    .filter((w) => w.date)
    .map((w) =>
      windowLabel({
        startAt: combineWitaDateAndMinutes(w.date, w.startMinute),
        endAt: combineWitaDateAndMinutes(w.date, w.endMinute),
      }),
    )
    .join("; ");

  const items: SummaryItem[] = [
    { label: "Pasien", value: patient?.name ?? null },
    { label: "Layanan", value: "Konsultasi Online" },
    { label: "Dokter", value: doctorName },
    { label: "Waktu luang", value: windowText || null },
    { label: "Sumber", value: SOURCE_LABEL[source] },
    { label: "Biaya booking", value: fee === null ? "tanpa biaya booking" : formatRupiah(fee) },
    { label: "Konsultasi Online", value: formatRupiah(servicePrice) },
    { label: "Total transfer", value: formatRupiah(total) },
  ];

  function startNew() {
    setCreated(null);
    setPatient(null);
    setWindows([EMPTY_WINDOW_DRAFT]);
    setNotes("");
    // Dokter dan sumber tetap: resepsionis biasanya mencatat beberapa booking berturut-turut.
  }

  function handleSubmit() {
    if (!patient) {
      toast.error("Pilih atau buat pasien terlebih dahulu.");
      return;
    }
    if (!staffId) {
      toast.error("Pilih dokter terlebih dahulu.");
      return;
    }
    const problem = windowDraftsError(windows, "STAFF", new Date());
    if (problem) {
      toast.error(problem);
      return;
    }

    startTransition(async () => {
      try {
        const result = await createOnlineAppointment({
          patientId: patient.id,
          staffId,
          source,
          windows,
          notes: notes.trim() || undefined,
        });
        if (!result.ok) {
          toast.error(result.error);
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

  return (
    <Box sx={{ display: "grid", gap: 3, alignItems: { lg: "start" }, gridTemplateColumns: { xs: "minmax(0, 1fr)", lg: "minmax(0, 1fr) 20rem" } }}>
      <Box
        component="fieldset"
        disabled={locked}
        sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, "&:disabled": { opacity: 0.6 } }}
      >
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
            2 · Dokter & sumber
          </Typography>
          <SelectField id="online-doctor" label="Dokter" value={staffId} onChange={setStaffId} fullWidth={false} sx={{ width: { xs: "100%", sm: 384 } }}>
            <option value="">Pilih dokter</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
          <Stack spacing={0.5}>
            <Typography id="online-source-label" variant="body2" sx={{ fontWeight: 500 }}>
              Sumber booking
            </Typography>
            <Box role="group" aria-labelledby="online-source-label" sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
              {(Object.keys(SOURCE_LABEL) as OnlineSource[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="small"
                  variant={source === value ? "contained" : "outlined"}
                  aria-pressed={source === value}
                  onClick={() => setSource(value)}
                >
                  {SOURCE_LABEL[value]}
                </Button>
              ))}
            </Box>
          </Stack>
        </Stack>

        <Stack component="section" spacing={1.5}>
          <Typography component="h2" sx={sectionTitle}>
            3 · Waktu pasien bisa dihubungi
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: "text.secondary" }}>
            1–3 waktu, jam 08.00–21.00, paling jauh {ONLINE_MAX_DAYS_AHEAD} hari ke depan. Dokter menelepon kapan saja di dalam rentang itu.
          </Typography>
          <ContactWindowsFields value={windows} onChange={setWindows} minDate={today} maxDate={maxDate} />
        </Stack>

        <Box component="section">
          <TextField
            id="online-notes"
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
          <BookingSummary items={items} />
          {!created && (
            <Button type="button" variant="contained" fullWidth disabled={pending} onClick={handleSubmit}>
              {pending ? "Menyimpan…" : "Buat Booking"}
            </Button>
          )}
        </Paper>
        {created && (
          <BookingCreatedPanel booking={created} dateLabel="Menunggu konfirmasi" listHref={`/admin/booking?sorot=${created.id}`} onNew={startNew} />
        )}
      </Box>
    </Box>
  );
}
