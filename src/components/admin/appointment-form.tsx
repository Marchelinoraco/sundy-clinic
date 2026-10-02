"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <fieldset disabled={locked} className="min-w-0 space-y-8 disabled:opacity-60">
        {notice && !locked && (
          <p role="status" className="rounded-md border border-gold-300 bg-gold-300/10 p-3 text-sm text-brown-800">
            {notice}
          </p>
        )}
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
          <h2 className="text-sm font-medium">2 · Layanan & tenaga</h2>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Jenis booking">
            {(["KONSULTASI", "TREATMENT"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "default" : "outline"}
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  resetSlot();
                }}
              >
                {k === "KONSULTASI" ? "Konsultasi Dokter (30 menit)" : "Treatment"}
              </Button>
            ))}
          </div>

          {kind === "TREATMENT" && (
            <div className="space-y-1">
              <Label htmlFor="booking-service">Layanan</Label>
              <Select
                value={serviceId}
                disabled={locked}
                onValueChange={(v) => {
                  setServiceId(v);
                  resetSlot();
                }}
              >
                <SelectTrigger id="booking-service" className="w-full sm:w-96">
                  <SelectValue placeholder="Pilih layanan" />
                </SelectTrigger>
                <SelectContent>
                  {treatmentGroups.map((group) => (
                    <SelectGroup key={group.name}>
                      <SelectLabel>{group.name}</SelectLabel>
                      {group.services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {s.durationMin} menit{s.requiresDoctor ? " · dokter" : ""}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {branches.length > 1 && (
              <div className="space-y-1">
                <Label htmlFor="booking-branch">Cabang</Label>
                <Select
                  value={branchId}
                  disabled={locked}
                  onValueChange={(v) => {
                    setBranchId(v);
                    resetSlot();
                  }}
                >
                  <SelectTrigger id="booking-branch" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="booking-staff">Tenaga</Label>
              <Select
                value={effectiveStaffId}
                disabled={locked}
                onValueChange={(v) => {
                  setStaffId(v);
                  resetSlot();
                }}
              >
                <SelectTrigger id="booking-staff" className="w-full">
                  <SelectValue placeholder="Pilih tenaga" />
                </SelectTrigger>
                <SelectContent>
                  {eligibleStaff.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsDoctor && (
                <p className="text-xs text-muted-foreground">Hanya dokter yang ditampilkan.</p>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <p id="booking-source-label" className="text-sm font-medium">
              Sumber booking
            </p>
            <div className="flex flex-wrap gap-2" role="group" aria-labelledby="booking-source-label">
              {ADMIN_SOURCES.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={source === value ? "default" : "outline"}
                  aria-pressed={source === value}
                  onClick={() => setSource(value)}
                >
                  {ADMIN_SOURCE_LABEL[value]}
                </Button>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">3 · Tanggal</h2>
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
            <p className="text-sm text-muted-foreground">Pilih layanan dan tenaga dulu.</p>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">4 · Jam</h2>
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
            <p className="text-sm text-muted-foreground">Pilih tanggal dulu.</p>
          )}
        </section>

        <section className="space-y-1">
          <Label htmlFor="booking-notes">Catatan (opsional)</Label>
          <Input
            id="booking-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Misal: keluhan utama, permintaan khusus"
          />
        </section>
      </fieldset>

      <aside aria-label="Ringkasan booking" className="space-y-4 lg:sticky lg:top-4">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <h2 className="font-medium">Ringkasan</h2>
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
            <Button type="button" className="w-full" disabled={pending} onClick={handleSubmit}>
              {pending ? "Menyimpan…" : "Buat Booking"}
            </Button>
          )}
        </div>
        {created && (
          <BookingCreatedPanel
            booking={created}
            dateLabel={formatShortIndonesianDate(combineWitaDateAndMinutes(created.date, 12 * 60))}
            onNew={startNew}
          />
        )}
      </aside>
    </div>
  );
}
