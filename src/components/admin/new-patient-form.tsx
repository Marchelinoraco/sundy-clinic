"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormHelperText from "@mui/material/FormHelperText";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { nikMismatchWarning, normalizeNik } from "@/lib/nik";
import {
  BIRTH_DATE_MIN,
  MARITAL_STATUS_LABEL,
  validatePatientRegistration,
  type PatientRegistrationInput,
  type RegistrationErrors,
  type RegistrationField,
} from "@/lib/patient-registration";
import { witaDateString } from "@/lib/time";
import { checkPatientNik, createPatient, findPatientsByWhatsapp, type PatientSummary } from "@/server/patient";
import { DateField } from "./mui/date-field";
import { DialogCloseButton } from "./mui/dialog-close-button";
import { SelectField } from "./mui/select-field";
import { NikCheckPanel, type NikCheckState } from "./nik-check-panel";
import { NikInput, type NikDraft } from "./nik-input";

type Props = {
  onCreated?: (patient: PatientSummary) => void;
  /** Bila diisi, peringatan duplikat dan cek NIK menawarkan tombol untuk memakai pasien yang sudah ada. */
  onPickExisting?: (patient: PatientSummary) => void;
};

type Draft = {
  nik: NikDraft;
  name: string;
  birthDate: string;
  whatsapp: string;
  email: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  address: string;
  maritalStatus: string;
};

const EMPTY: Draft = {
  nik: { mode: "NIK", value: "" },
  name: "",
  birthDate: "",
  whatsapp: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  address: "",
  maritalStatus: "",
};

type NikResult = "FREE" | "ERROR" | { patient: PatientSummary; birthDateLabel: string | null };

function toInput(draft: Draft): PatientRegistrationInput {
  return {
    nik: draft.nik.mode === "NIK" ? draft.nik.value : null,
    nikMissingReason: draft.nik.mode === "MISSING" ? draft.nik.reason || null : null,
    name: draft.name,
    birthDate: draft.birthDate,
    whatsapp: draft.whatsapp,
    email: draft.email,
    emergencyContactName: draft.emergencyContactName,
    emergencyContactPhone: draft.emergencyContactPhone,
    address: draft.address,
    maritalStatus: draft.maritalStatus || null,
  };
}

export function NewPatientForm({ onCreated, onPickExisting }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<PatientSummary[]>([]);
  // Hasil cek NIK dicatat bersama NIK yang diperiksa: jawaban untuk NIK yang sudah diganti tidak berlaku.
  const [checked, setChecked] = useState<{ nik: string; result: NikResult } | null>(null);
  const [pending, startTransition] = useTransition();
  // Transition terpisah: pemeriksaan duplikat terpicu saat kolom nomor kehilangan fokus — tepat ketika admin
  // mengklik "Buat Pasien". Bila berbagi `pending`, tombol itu sudah nonaktif saat kliknya mendarat.
  const [, startDuplicateCheck] = useTransition();

  const typedNik = draft.nik.mode === "NIK" ? normalizeNik(draft.nik.value) : null;

  useEffect(() => {
    if (!typedNik) return;
    let current = true;
    checkPatientNik(typedNik)
      .then((result) => {
        if (!current) return;
        if (!result.ok) {
          setChecked({ nik: typedNik, result: "ERROR" });
          return;
        }
        setChecked({
          nik: typedNik,
          result: result.data.status === "FREE" ? "FREE" : { patient: result.data.patient, birthDateLabel: result.data.birthDateLabel },
        });
      })
      .catch(() => {
        if (current) setChecked({ nik: typedNik, result: "ERROR" });
      });
    return () => {
      current = false;
    };
  }, [typedNik]);

  let nikState: NikCheckState = { kind: "IDLE" };
  if (typedNik) {
    if (checked?.nik !== typedNik) nikState = { kind: "CHECKING" };
    else if (checked.result === "FREE") nikState = { kind: "FREE" };
    else if (checked.result === "ERROR") nikState = { kind: "ERROR" };
    else nikState = { kind: "TAKEN", ...checked.result };
  }

  const nikWarning = typedNik ? nikMismatchWarning(typedNik, { birthDate: draft.birthDate || null, gender: null }) : null;

  function update(patch: Partial<Draft>) {
    setDraft((value) => ({ ...value, ...patch }));
    setErrors((value) => {
      const next = { ...value };
      for (const key of Object.keys(patch)) delete next[key as RegistrationField];
      return next;
    });
    setServerError(null);
  }

  function close() {
    setOpen(false);
    setDraft(EMPTY);
    setErrors({});
    setServerError(null);
    setDuplicates([]);
    setChecked(null);
  }

  function handleCheckDuplicate() {
    if (!draft.whatsapp.trim()) {
      setDuplicates([]);
      return;
    }
    startDuplicateCheck(async () => {
      try {
        setDuplicates(await findPatientsByWhatsapp(draft.whatsapp));
      } catch {
        // Pemeriksaan duplikat hanya peringatan; kegagalannya tidak boleh menghalangi pendaftaran.
        setDuplicates([]);
      }
    });
  }

  function handleCreate() {
    const input = toInput(draft);
    const validation = validatePatientRegistration(input, witaDateString(new Date()));
    if (!validation.ok) {
      setErrors(validation.errors);
      setServerError(null);
      return;
    }
    setErrors({});
    setServerError(null);
    startTransition(async () => {
      try {
        const result = await createPatient(input);
        if (!result.ok) {
          setServerError(result.error);
          return;
        }
        const patient = result.data;
        toast.success(`Pasien ${patient.name} (${patient.medicalRecordNumber}) dibuat.`);
        onCreated?.(patient);
        close();
      } catch {
        setServerError("Gagal membuat pasien. Coba lagi.");
      }
    });
  }

  function handlePickExisting(patient: PatientSummary) {
    onPickExisting?.(patient);
    close();
  }

  const today = witaDateString(new Date());

  return (
    <>
      <Button type="button" variant="outlined" size="small" onClick={() => setOpen(true)}>
        + Pasien Baru
      </Button>
      <Dialog
        open={open}
        // Formulir panjang: klik latar yang tak disengaja tidak boleh membuang isian. Silang, Batal, dan Escape tetap menutup.
        onClose={(_, reason) => {
          if (reason === "backdropClick" || pending) return;
          close();
        }}
        fullWidth
        maxWidth="sm"
        scroll="paper"
      >
        <DialogTitle sx={{ pr: 6 }}>Pasien baru</DialogTitle>
        <DialogCloseButton onClick={close} />
        {/* Tanpa elemen <form>: dialog ini dipakai di dalam dialog/halaman lain, dan event submit React menggelembung lewat portal. */}
        <DialogContent dividers>
          <Stack spacing={2}>
            <div>
              <NikInput draft={draft.nik} onChange={(nik) => update({ nik })} warning={nikWarning} />
              {errors.nik && <FormHelperText error>{errors.nik}</FormHelperText>}
            </div>
            <NikCheckPanel state={nikState} onPickExisting={onPickExisting ? handlePickExisting : undefined} />

            <TextField
              id="new-patient-name"
              label="Nama"
              value={draft.name}
              onChange={(e) => update({ name: e.target.value })}
              error={!!errors.name}
              helperText={errors.name}
              fullWidth
            />
            <DateField
              id="new-patient-birth-date"
              label="Tanggal lahir"
              value={draft.birthDate}
              onChange={(birthDate) => update({ birthDate })}
              min={BIRTH_DATE_MIN}
              max={today}
              error={!!errors.birthDate}
              helperText={errors.birthDate}
              fullWidth
            />
            <TextField
              id="new-patient-whatsapp"
              label="No. HP (WhatsApp)"
              value={draft.whatsapp}
              onChange={(e) => update({ whatsapp: e.target.value })}
              onBlur={handleCheckDuplicate}
              placeholder="081234567890"
              slotProps={{ htmlInput: { inputMode: "tel" } }}
              error={!!errors.whatsapp}
              helperText={errors.whatsapp}
              fullWidth
            />

            {duplicates.length > 0 && (
              <Alert severity="warning" icon={false}>
                <Box component="p" sx={{ mt: 0, mb: 1 }}>
                  Nomor ini sudah terdaftar. Pastikan ini bukan pasien yang sama:
                </Box>
                <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {duplicates.map((p) => (
                    <Box component="li" key={p.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                      <span>
                        <strong>{p.name}</strong> · {p.medicalRecordNumber}
                      </span>
                      {onPickExisting && (
                        <Button type="button" size="small" variant="outlined" onClick={() => handlePickExisting(p)}>
                          Pakai pasien ini
                        </Button>
                      )}
                    </Box>
                  ))}
                </Box>
              </Alert>
            )}

            {/* type="text" + inputMode: validasi bawaan peramban tidak ikut campur; aturannya di validatePatientRegistration. */}
            <TextField
              id="new-patient-email"
              label="Email (opsional)"
              value={draft.email}
              onChange={(e) => update({ email: e.target.value })}
              placeholder="nama@contoh.com"
              slotProps={{ htmlInput: { inputMode: "email", autoComplete: "off" } }}
              error={!!errors.email}
              helperText={errors.email}
              fullWidth
            />
            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))" } }}>
              <TextField
                id="new-patient-emergency-name"
                label="Nama kontak darurat"
                value={draft.emergencyContactName}
                onChange={(e) => update({ emergencyContactName: e.target.value })}
                error={!!errors.emergencyContactName}
                helperText={errors.emergencyContactName}
                fullWidth
              />
              <TextField
                id="new-patient-emergency-phone"
                label="Nomor kontak darurat"
                value={draft.emergencyContactPhone}
                onChange={(e) => update({ emergencyContactPhone: e.target.value })}
                placeholder="081234567890"
                slotProps={{ htmlInput: { inputMode: "tel" } }}
                error={!!errors.emergencyContactPhone}
                helperText={errors.emergencyContactPhone}
                fullWidth
              />
            </Box>
            <TextField
              id="new-patient-address"
              label="Alamat"
              value={draft.address}
              onChange={(e) => update({ address: e.target.value })}
              error={!!errors.address}
              helperText={errors.address}
              multiline
              minRows={2}
              fullWidth
            />
            <SelectField
              id="new-patient-marital-status"
              label="Status pernikahan (opsional)"
              value={draft.maritalStatus}
              onChange={(maritalStatus) => update({ maritalStatus })}
              error={!!errors.maritalStatus}
              helperText={errors.maritalStatus}
            >
              <option value="">— Tidak diisi —</option>
              {Object.entries(MARITAL_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>

            {serverError && <Alert severity="error">{serverError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" variant="text" disabled={pending} onClick={close}>
            Batal
          </Button>
          <Button type="button" variant="contained" disabled={pending || nikState.kind === "TAKEN"} onClick={handleCreate}>
            {pending ? "Menyimpan…" : "Buat Pasien"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
