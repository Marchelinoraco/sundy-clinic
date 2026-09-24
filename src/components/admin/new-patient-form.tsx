"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { Patient } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPatient, findPatientsByWhatsapp } from "@/server/patient";

type Props = {
  onCreated?: (patient: Patient) => void;
  /** Bila diisi, peringatan duplikat menawarkan tombol untuk memakai pasien yang sudah ada. */
  onPickExisting?: (patient: Patient) => void;
};

export function NewPatientForm({ onCreated, onPickExisting }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [duplicates, setDuplicates] = useState<Patient[]>([]);
  const [pending, startTransition] = useTransition();
  // Transition terpisah: pemeriksaan duplikat terpicu saat kolom WhatsApp
  // kehilangan fokus — tepat ketika admin mengklik "Buat Pasien". Bila
  // berbagi `pending`, tombol itu sudah nonaktif saat kliknya mendarat.
  const [, startDuplicateCheck] = useTransition();

  function close() {
    setOpen(false);
    setName("");
    setWhatsapp("");
    setDuplicates([]);
  }

  function handleCheckDuplicate() {
    if (!whatsapp.trim()) {
      setDuplicates([]);
      return;
    }
    startDuplicateCheck(async () => {
      try {
        setDuplicates(await findPatientsByWhatsapp(whatsapp));
      } catch {
        // Pemeriksaan duplikat hanya peringatan; kegagalannya tidak boleh menghalangi pendaftaran.
        setDuplicates([]);
      }
    });
  }

  function handleCreate() {
    if (!name.trim() || !whatsapp.trim()) {
      toast.error("Nama dan nomor WhatsApp wajib diisi.");
      return;
    }
    startTransition(async () => {
      try {
        const result = await createPatient({ name, whatsapp });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        const patient = result.data;
        toast.success(`Pasien ${patient.name} (${patient.medicalRecordNumber}) dibuat.`);
        onCreated?.(patient);
        close();
      } catch {
        toast.error("Gagal membuat pasien. Coba lagi.");
      }
    });
  }

  function handlePickExisting(patient: Patient) {
    onPickExisting?.(patient);
    close();
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        + Pasien Baru
      </Button>
    );
  }

  return (
    <div className="max-w-md space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <Label htmlFor="new-patient-name">Nama</Label>
        <Input id="new-patient-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-patient-whatsapp">Nomor WhatsApp</Label>
        <Input
          id="new-patient-whatsapp"
          inputMode="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          onBlur={handleCheckDuplicate}
          placeholder="081234567890"
        />
      </div>

      {duplicates.length > 0 && (
        <div className="space-y-2 rounded-md bg-amber-100 p-2 text-sm text-amber-900">
          <p>Nomor ini sudah terdaftar. Pastikan ini bukan pasien yang sama:</p>
          <ul className="space-y-1">
            {duplicates.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{p.name}</strong> · {p.medicalRecordNumber}
                </span>
                {onPickExisting && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handlePickExisting(p)}
                  >
                    Pakai pasien ini
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={handleCreate}>
          {pending ? "Menyimpan…" : "Buat Pasien"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={close}>
          Batal
        </Button>
      </div>
    </div>
  );
}
