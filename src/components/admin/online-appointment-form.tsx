"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ContactWindowsEditor } from "@/components/online/contact-windows-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <fieldset disabled={locked} className="min-w-0 space-y-8 disabled:opacity-60">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">1 · Pasien</h2>
          {patient ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
              <span>
                <span className="font-medium">{patient.name}</span>{" "}
                <span className="text-muted-foreground">
                  ({patient.medicalRecordNumber} · {patient.whatsapp})
                </span>
                <PatientBookingInfo patient={patient} />
              </span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPatient(null)}>
                Ganti pasien
              </Button>
            </div>
          ) : (
            <PatientPicker onSelect={setPatient} />
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">2 · Dokter & sumber</h2>
          <div className="space-y-1">
            <Label htmlFor="online-doctor">Dokter</Label>
            <select
              id="online-doctor"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-96"
            >
              <option value="">Pilih dokter</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p id="online-source-label" className="text-sm font-medium">
              Sumber booking
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="online-source-label">
              {(Object.keys(SOURCE_LABEL) as OnlineSource[]).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={source === value ? "default" : "outline"}
                  aria-pressed={source === value}
                  onClick={() => setSource(value)}
                >
                  {SOURCE_LABEL[value]}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">3 · Waktu pasien bisa dihubungi</h2>
          <p className="text-xs text-muted-foreground">
            1–3 waktu, jam 08.00–21.00, paling jauh {ONLINE_MAX_DAYS_AHEAD} hari ke depan. Dokter menelepon kapan saja di
            dalam rentang itu.
          </p>
          <ContactWindowsEditor value={windows} onChange={setWindows} minDate={today} maxDate={maxDate} />
        </section>

        <section className="space-y-1">
          <Label htmlFor="online-notes">Catatan (opsional)</Label>
          <Input
            id="online-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Misal: keluhan utama, permintaan khusus"
          />
        </section>
      </fieldset>

      <aside aria-label="Ringkasan booking" className="space-y-4 lg:sticky lg:top-4">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-medium">Ringkasan</h2>
          <BookingSummary items={items} />
          {!created && (
            <Button type="button" className="w-full" disabled={pending} onClick={handleSubmit}>
              {pending ? "Menyimpan…" : "Buat Booking"}
            </Button>
          )}
        </div>
        {created && (
          <BookingCreatedPanel
            booking={created}
            dateLabel="Menunggu konfirmasi"
            listHref={`/admin/booking?sorot=${created.id}`}
            onNew={startNew}
          />
        )}
      </aside>
    </div>
  );
}
