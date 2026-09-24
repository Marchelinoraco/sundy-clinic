"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { BookingSource, Patient } from "@prisma/client";
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
import { formatIndonesianDate } from "@/lib/format";
import type { SlotOption } from "@/lib/slot";
import { createAppointment } from "@/server/appointment";
import { PatientPicker } from "./patient-picker";
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
};

type BookingKind = "KONSULTASI" | "TREATMENT";
type AdminSource = Exclude<BookingSource, "SITUS">;

const CONSULTATION_MINUTES = 30;

const SOURCE_LABEL: Record<AdminSource, string> = {
  TELEPON: "Telepon",
  WHATSAPP: "WhatsApp",
  WALK_IN: "Walk-in",
};

export function AppointmentForm({
  branches,
  staff,
  treatmentGroups,
  consultationServiceId,
  today,
}: Props) {
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [kind, setKind] = useState<BookingKind>("KONSULTASI");
  const [serviceId, setServiceId] = useState("");
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [staffId, setStaffId] = useState("");
  const [source, setSource] = useState<AdminSource>("TELEPON");
  const [date, setDate] = useState(today);
  const [slot, setSlot] = useState<SlotOption | null>(null);
  const [notes, setNotes] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
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

  const canPickSlot = Boolean(effectiveStaffId && branchId && date && durationMinutes);

  function resetSlot() {
    setSlot(null);
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
      toast.error("Pilih tenaga dan jam terlebih dahulu.");
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
          // Slot yang baru saja direbut booking lain harus hilang dari pilihan.
          setSlot(null);
          setRefreshKey((k) => k + 1);
          return;
        }
        toast.success(
          `Booking ${result.data.code} dibuat — ${patient.name}, ${formatIndonesianDate(slot.startAt)} pukul ${slot.label}.`,
        );
        router.push("/admin/booking");
      } catch {
        toast.error("Gagal membuat booking. Coba lagi.");
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-2">
        <h2 className="text-sm font-medium">1. Pasien</h2>
        {patient ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
            <span>
              <span className="font-medium">{patient.name}</span>{" "}
              <span className="text-muted-foreground">
                ({patient.medicalRecordNumber} · {patient.whatsapp})
              </span>
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
        <h2 className="text-sm font-medium">2. Jenis & Layanan</h2>
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
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <h2 className="text-sm font-medium sm:col-span-2">3. Tempat & Tenaga</h2>
        {branches.length > 1 && (
          <div className="space-y-1">
            <Label htmlFor="booking-branch">Cabang</Label>
            <Select
              value={branchId}
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

        <div className="space-y-1">
          <Label htmlFor="booking-source">Sumber Booking</Label>
          <Select value={source} onValueChange={(v) => setSource(v as AdminSource)}>
            <SelectTrigger id="booking-source" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SOURCE_LABEL) as AdminSource[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {SOURCE_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">4. Tanggal & Jam</h2>
        <div className="space-y-1">
          <Label htmlFor="booking-date">Tanggal</Label>
          <Input
            id="booking-date"
            type="date"
            min={today}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              resetSlot();
            }}
            className="w-44"
          />
        </div>
        {canPickSlot ? (
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
          <p className="text-sm text-muted-foreground">
            {kind === "TREATMENT" && !treatment
              ? "Pilih layanan untuk melihat jam kosong."
              : "Pilih tenaga dan tanggal untuk melihat jam kosong."}
          </p>
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

      <Button type="button" disabled={pending} onClick={handleSubmit}>
        {pending ? "Menyimpan…" : "Buat Booking"}
      </Button>
    </div>
  );
}
