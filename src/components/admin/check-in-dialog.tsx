"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FoodRecallLinkInfo } from "@/lib/food-recall";
import { NIK_FORMAT_ERROR, NIK_MISSING_REASONS, nikMismatchWarning, normalizeNik } from "@/lib/nik";
import {
  checkInAppointment,
  getCheckInForm,
  lookupNikOwner,
  mergeDuplicatePatient,
  type CheckInForm,
  type CheckInNik,
  type NikOwner,
} from "@/server/check-in";
import { FoodRecallLinkPanel } from "./food-recall-link-panel";
import { NikInput, type NikDraft } from "./nik-input";

export type CheckInTarget = { appointmentId: string; code: string; patientName: string };

type IdentityDraft = { birthDate: string; gender: "" | "L" | "P"; occupation: string; address: string };

type Draft = {
  /** false: NIK tersimpan dipakai apa adanya (tombol "Ubah" untuk menyunting). */
  nikEditing: boolean;
  nik: NikDraft;
  identity: IdentityDraft;
  whatsapp: string;
  offer: boolean;
};

type Step =
  | { kind: "form" }
  | { kind: "conflict"; owner: NikOwner; nik: string }
  | { kind: "done"; foodRecall: Exclude<FoodRecallLinkInfo, { state: "NOT_OFFERED" }> };

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const textareaClass =
  "min-h-16 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

function draftFor(form: CheckInForm): Draft {
  return {
    nikEditing: form.patient.nik === null,
    nik: { mode: "NIK", value: form.patient.nik ?? "" },
    identity: { birthDate: "", gender: "", occupation: "", address: "" },
    whatsapp: form.patient.whatsapp,
    offer: form.offerFoodRecallByDefault,
  };
}

/** Kolom data diri yang masih kosong; hanya ini yang ditampilkan dan dikirim (spec check-in 3.1). */
function missingOf(patient: CheckInForm["patient"]) {
  return {
    birthDate: !patient.birthDate,
    gender: !patient.gender,
    occupation: !patient.occupation?.trim(),
    address: !patient.address?.trim(),
  };
}

/**
 * Check-in di meja depan (spec check-in bagian 3): NIK, data diri yang masih
 * kosong, nomor WA, lalu food recall. NIK yang sudah milik pasien lain
 * menampilkan pemiliknya dan pilihan pindah pasien rangkap.
 */
export function CheckInDialog({
  target,
  open,
  onOpenChange,
}: {
  target: CheckInTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const id = useId();
  // undefined = masih dimuat; null = tidak bisa di-check-in (pesannya di loadError).
  const [form, setForm] = useState<CheckInForm | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [step, setStep] = useState<Step>({ kind: "form" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let current = true;
    getCheckInForm(target.appointmentId)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setLoadError(result.error);
          setForm(null);
          return;
        }
        setForm(result.data);
        setDraft(draftFor(result.data));
      })
      .catch(() => {
        if (!current) return;
        setLoadError("Data check-in gagal dimuat. Coba lagi.");
        setForm(null);
      });
    return () => {
      current = false;
    };
  }, [target.appointmentId]);

  const update = (patch: Partial<Draft>) => setDraft((value) => (value ? { ...value, ...patch } : value));
  const setIdentity = (patch: Partial<IdentityDraft>) =>
    setDraft((value) => (value ? { ...value, identity: { ...value.identity, ...patch } } : value));

  function nikChoice(current: Draft): CheckInNik | string {
    if (!current.nikEditing) return { kind: "KEEP" };
    if (current.nik.mode === "MISSING") {
      return current.nik.reason ? { kind: "MISSING", reason: current.nik.reason } : "Pilih alasan belum ada NIK.";
    }
    const value = normalizeNik(current.nik.value);
    return value ? { kind: "SET", value } : NIK_FORMAT_ERROR;
  }

  function identityPayload(current: Draft, patient: CheckInForm["patient"]) {
    const missing = missingOf(patient);
    return {
      ...(missing.birthDate ? { birthDate: current.identity.birthDate } : {}),
      ...(missing.gender && current.identity.gender ? { gender: current.identity.gender } : {}),
      ...(missing.occupation ? { occupation: current.identity.occupation } : {}),
      ...(missing.address ? { address: current.identity.address } : {}),
    };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!form || !draft) return;
    const choice = nikChoice(draft);
    if (typeof choice === "string") {
      setError(choice);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        if (choice.kind === "SET" && choice.value !== form.patient.nik) {
          const lookup = await lookupNikOwner({ appointmentId: form.appointmentId, nik: choice.value });
          if (!lookup.ok) {
            setError(lookup.error);
            return;
          }
          if (lookup.data) {
            setStep({ kind: "conflict", owner: lookup.data, nik: choice.value });
            return;
          }
        }
        const result = await checkInAppointment({
          appointmentId: form.appointmentId,
          nik: choice,
          identity: identityPayload(draft, form.patient),
          whatsapp: draft.whatsapp,
          offerFoodRecall: draft.offer,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        toast.success(`${result.data.patientName} sudah check-in.`);
        router.refresh();
        const foodRecall = result.data.foodRecall;
        if (foodRecall && foodRecall.state !== "NOT_OFFERED") setStep({ kind: "done", foodRecall });
        else onOpenChange(false);
      } catch {
        setError("Check-in gagal. Coba lagi.");
      }
    });
  }

  function merge(nik: string) {
    startTransition(async () => {
      try {
        const result = await mergeDuplicatePatient({ appointmentId: target.appointmentId, nik });
        setStep({ kind: "form" });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setForm(result.data);
        setDraft((value) => ({ ...draftFor(result.data), offer: value?.offer ?? result.data.offerFoodRecallByDefault }));
        setError(null);
        toast.success(`Booking dipindah ke ${result.data.patient.name} (${result.data.patient.medicalRecordNumber}).`);
        router.refresh();
      } catch {
        setStep({ kind: "form" });
        setError("Gagal memindahkan. Coba lagi.");
      }
    });
  }

  const patient = form?.patient;
  const missing = patient ? missingOf(patient) : null;
  const typedNik = draft && draft.nikEditing && draft.nik.mode === "NIK" ? normalizeNik(draft.nik.value) : null;
  const warning =
    typedNik && patient && draft
      ? nikMismatchWarning(typedNik, {
          birthDate: patient.birthDate ?? (draft.identity.birthDate || null),
          gender: patient.gender ?? (draft.identity.gender || null),
        })
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Check-in — {target.code}</DialogTitle>
          <DialogDescription>{form?.summary ?? target.patientName}</DialogDescription>
        </DialogHeader>

        {form === undefined && <p className="text-sm text-muted-foreground">Memuat…</p>}
        {form === null && <p className="text-sm text-destructive">{loadError}</p>}

        {form && draft && patient && missing && step.kind === "conflict" && (
          <section aria-labelledby={`${id}-conflict`} className="space-y-3 text-sm">
            <h3 id={`${id}-conflict`} className="font-medium">
              NIK ini sudah milik pasien lain
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border p-3">
              <dt className="text-muted-foreground">Nama</dt>
              <dd>{step.owner.name}</dd>
              <dt className="text-muted-foreground">No. RM</dt>
              <dd>{step.owner.medicalRecordNumber}</dd>
              <dt className="text-muted-foreground">Tanggal lahir</dt>
              <dd>{step.owner.birthDateLabel ?? "—"}</dd>
              <dt className="text-muted-foreground">WhatsApp</dt>
              <dd>{step.owner.whatsapp}</dd>
              <dt className="text-muted-foreground">Kunjungan terakhir</dt>
              <dd>{step.owner.lastVisitLabel ?? "belum pernah"}</dd>
            </dl>
            {step.owner.merge.allowed ? (
              <p className="text-muted-foreground">
                Bila orangnya sama, semua booking dan isian {patient.name} ({patient.medicalRecordNumber}) dipindah ke pasien ini.
              </p>
            ) : (
              <p className="text-destructive">{step.owner.merge.reason}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {step.owner.merge.allowed && (
                <Button type="button" disabled={pending} onClick={() => merge(step.nik)}>
                  Ini orang yang sama — pindahkan
                </Button>
              )}
              <Button type="button" variant="outline" disabled={pending} onClick={() => setStep({ kind: "form" })}>
                Bukan — periksa lagi NIK-nya
              </Button>
            </div>
          </section>
        )}

        {form && step.kind === "done" && (
          <section aria-labelledby={`${id}-done`} className="space-y-3">
            <p className="text-sm">✓ {form.patient.name} sudah check-in.</p>
            <h3 id={`${id}-done`} className="text-sm font-medium">
              Food recall
            </h3>
            <FoodRecallLinkPanel info={step.foodRecall} />
            <Button type="button" variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Selesai
            </Button>
          </section>
        )}

        {form && draft && patient && missing && step.kind === "form" && (
          <form onSubmit={submit} className="space-y-4 text-sm">
            <p>
              <span className="font-medium">{patient.name}</span>{" "}
              <span className="text-muted-foreground">{patient.medicalRecordNumber}</span>
            </p>

            {draft.nikEditing ? (
              <div className="space-y-1">
                {patient.nikMissingReason && (
                  <p className="text-xs text-amber-700">
                    Sebelumnya: belum ada NIK ({NIK_MISSING_REASONS[patient.nikMissingReason]}). Tanyakan lagi.
                  </p>
                )}
                <NikInput draft={draft.nik} onChange={(nik) => update({ nik })} warning={warning} />
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span>NIK {patient.nik}</span>
                <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => update({ nikEditing: true })}>
                  Ubah
                </Button>
              </div>
            )}

            {(missing.birthDate || missing.gender || missing.occupation || missing.address) && (
              <fieldset className="space-y-3">
                <legend className="font-medium">Data diri yang masih kosong</legend>
                {missing.birthDate && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-birth`}>Tanggal lahir</Label>
                    <Input
                      id={`${id}-birth`}
                      type="date"
                      value={draft.identity.birthDate}
                      onChange={(e) => setIdentity({ birthDate: e.target.value })}
                    />
                  </div>
                )}
                {missing.gender && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-gender`}>Jenis kelamin</Label>
                    <select
                      id={`${id}-gender`}
                      className={selectClass}
                      value={draft.identity.gender}
                      onChange={(e) => setIdentity({ gender: e.target.value as IdentityDraft["gender"] })}
                    >
                      <option value="">Pilih</option>
                      <option value="P">Perempuan</option>
                      <option value="L">Laki-laki</option>
                    </select>
                  </div>
                )}
                {missing.occupation && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-job`}>Pekerjaan</Label>
                    <Input
                      id={`${id}-job`}
                      maxLength={100}
                      value={draft.identity.occupation}
                      onChange={(e) => setIdentity({ occupation: e.target.value })}
                    />
                  </div>
                )}
                {missing.address && (
                  <div className="space-y-1">
                    <Label htmlFor={`${id}-address`}>Alamat</Label>
                    <textarea
                      id={`${id}-address`}
                      rows={2}
                      maxLength={200}
                      value={draft.identity.address}
                      onChange={(e) => setIdentity({ address: e.target.value })}
                      className={textareaClass}
                    />
                  </div>
                )}
              </fieldset>
            )}

            <div className="space-y-1">
              <Label htmlFor={`${id}-wa`}>Nomor WhatsApp</Label>
              <Input id={`${id}-wa`} inputMode="tel" value={draft.whatsapp} onChange={(e) => update({ whatsapp: e.target.value })} />
              <p className="text-xs text-muted-foreground">Pastikan masih aktif untuk pengingat kontrol.</p>
            </div>

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={draft.offer} onChange={(e) => update({ offer: e.target.checked })} />
              Tawarkan food recall
            </label>

            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={pending}>
              Check-in
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
