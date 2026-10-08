"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
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
import { DateField } from "./mui/date-field";
import { DialogCloseButton } from "./mui/dialog-close-button";
import { SelectField } from "./mui/select-field";
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

  const secondary = { color: "text.secondary" } as const;

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} scroll="paper">
      <DialogTitle sx={{ pr: 6 }}>Check-in — {target.code}</DialogTitle>
      <DialogCloseButton onClick={() => onOpenChange(false)} />
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{form?.summary ?? target.patientName}</DialogContentText>

        {form === undefined && (
          <Typography variant="body2" sx={secondary}>
            Memuat…
          </Typography>
        )}
        {form === null && (
          <Typography variant="body2" sx={{ color: "error.main" }}>
            {loadError}
          </Typography>
        )}

        {form && draft && patient && missing && step.kind === "conflict" && (
          <Box component="section" aria-labelledby={`${id}-conflict`} sx={{ display: "flex", flexDirection: "column", gap: 1.5, fontSize: "0.875rem" }}>
            <Typography component="h3" id={`${id}-conflict`} sx={{ fontWeight: 500, fontSize: "0.875rem" }}>
              NIK ini sudah milik pasien lain
            </Typography>
            <Paper
              variant="outlined"
              component="dl"
              sx={{ m: 0, p: 1.5, display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 1.5, rowGap: 0.5, "& dt": secondary, "& dd": { m: 0 } }}
            >
              <dt>Nama</dt>
              <dd>{step.owner.name}</dd>
              <dt>No. RM</dt>
              <dd>{step.owner.medicalRecordNumber}</dd>
              <dt>Tanggal lahir</dt>
              <dd>{step.owner.birthDateLabel ?? "—"}</dd>
              <dt>WhatsApp</dt>
              <dd>{step.owner.whatsapp}</dd>
              <dt>Kunjungan terakhir</dt>
              <dd>{step.owner.lastVisitLabel ?? "belum pernah"}</dd>
            </Paper>
            {step.owner.merge.allowed ? (
              <Box component="p" sx={{ m: 0, ...secondary }}>
                Bila orangnya sama, semua booking dan isian {patient.name} ({patient.medicalRecordNumber}) dipindah ke pasien ini.
              </Box>
            ) : (
              <Box component="p" sx={{ m: 0, color: "error.main" }}>
                {step.owner.merge.reason}
              </Box>
            )}
            <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
              {step.owner.merge.allowed && (
                <Button type="button" variant="contained" disabled={pending} onClick={() => merge(step.nik)}>
                  Ini orang yang sama — pindahkan
                </Button>
              )}
              <Button type="button" variant="outlined" disabled={pending} onClick={() => setStep({ kind: "form" })}>
                Bukan — periksa lagi NIK-nya
              </Button>
            </Stack>
          </Box>
        )}

        {form && step.kind === "done" && (
          <Box component="section" aria-labelledby={`${id}-done`} sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Typography variant="body2">✓ {form.patient.name} sudah check-in.</Typography>
            <Typography component="h3" id={`${id}-done`} sx={{ fontSize: "0.875rem", fontWeight: 500 }}>
              Food recall
            </Typography>
            <FoodRecallLinkPanel info={step.foodRecall} />
            <Button type="button" variant="outlined" fullWidth onClick={() => onOpenChange(false)}>
              Selesai
            </Button>
          </Box>
        )}

        {form && draft && patient && missing && step.kind === "form" && (
          <Box component="form" onSubmit={submit} sx={{ display: "flex", flexDirection: "column", gap: 2, fontSize: "0.875rem" }}>
            <Box component="p" sx={{ m: 0 }}>
              <Box component="span" sx={{ fontWeight: 500 }}>
                {patient.name}
              </Box>{" "}
              <Box component="span" sx={secondary}>
                {patient.medicalRecordNumber}
              </Box>
            </Box>

            {draft.nikEditing ? (
              <Stack spacing={0.5}>
                {patient.nikMissingReason && (
                  <Typography variant="caption" component="p" sx={{ color: "warning.main" }}>
                    Sebelumnya: belum ada NIK ({NIK_MISSING_REASONS[patient.nikMissingReason]}). Tanyakan lagi.
                  </Typography>
                )}
                <NikInput draft={draft.nik} onChange={(nik) => update({ nik })} warning={warning} />
              </Stack>
            ) : (
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <span>NIK {patient.nik}</span>
                <Button type="button" variant="text" size="small" sx={{ px: 0, minWidth: 0, textDecoration: "underline" }} onClick={() => update({ nikEditing: true })}>
                  Ubah
                </Button>
              </Stack>
            )}

            {(missing.birthDate || missing.gender || missing.occupation || missing.address) && (
              <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5 }}>
                <Box component="legend" sx={{ p: 0, mb: 1, fontWeight: 500 }}>
                  Data diri yang masih kosong
                </Box>
                {missing.birthDate && (
                  <DateField id={`${id}-birth`} label="Tanggal lahir" value={draft.identity.birthDate} onChange={(birthDate) => setIdentity({ birthDate })} fullWidth />
                )}
                {missing.gender && (
                  <SelectField
                    id={`${id}-gender`}
                    label="Jenis kelamin"
                    value={draft.identity.gender}
                    onChange={(value) => setIdentity({ gender: value as IdentityDraft["gender"] })}
                  >
                    <option value="">Pilih</option>
                    <option value="P">Perempuan</option>
                    <option value="L">Laki-laki</option>
                  </SelectField>
                )}
                {missing.occupation && (
                  <TextField
                    id={`${id}-job`}
                    label="Pekerjaan"
                    value={draft.identity.occupation}
                    onChange={(e) => setIdentity({ occupation: e.target.value })}
                    slotProps={{ htmlInput: { maxLength: 100 } }}
                    fullWidth
                  />
                )}
                {missing.address && (
                  <TextField
                    id={`${id}-address`}
                    label="Alamat"
                    multiline
                    minRows={2}
                    value={draft.identity.address}
                    onChange={(e) => setIdentity({ address: e.target.value })}
                    slotProps={{ htmlInput: { maxLength: 200 } }}
                    fullWidth
                  />
                )}
              </Box>
            )}

            <TextField
              id={`${id}-wa`}
              label="Nomor WhatsApp"
              value={draft.whatsapp}
              onChange={(e) => update({ whatsapp: e.target.value })}
              helperText="Pastikan masih aktif untuk pengingat kontrol."
              slotProps={{ htmlInput: { inputMode: "tel" } }}
              fullWidth
            />

            <FormControlLabel control={<Checkbox checked={draft.offer} onChange={(e) => update({ offer: e.target.checked })} />} label="Tawarkan food recall" />

            {error && <Alert severity="error">{error}</Alert>}

            <Button type="submit" variant="contained" fullWidth disabled={pending}>
              Check-in
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
