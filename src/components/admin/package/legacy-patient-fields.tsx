"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { useEffect, useState, useTransition } from "react";
import { normalizeNik } from "@/lib/nik";
import type { LegacyPatientErrors, LegacyPatientInput } from "@/lib/patient-registration";
import { checkPatientNik, findPatientsByWhatsapp, type PatientSummary } from "@/server/patient";
import { DateField } from "../mui/date-field";
import { SelectField } from "../mui/select-field";
import { NikCheckPanel, type NikCheckState } from "../nik-check-panel";

export const EMPTY_LEGACY_PATIENT: LegacyPatientInput = {
  nik: "",
  name: "",
  whatsapp: "",
  birthDate: "",
  gender: null,
  address: "",
  email: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
};

type NikResult = "FREE" | "ERROR" | { patient: PatientSummary; birthDateLabel: string | null };

/**
 * Pasien baru dari dialog paket lama (spec paket lama PL9): hanya nama dan WA yang wajib; isian lain diisi bila terlihat di
 * Kluto. WA atau NIK yang sudah terdaftar menawarkan "Pakai pasien ini", seperti dialog Pasien baru.
 */
export function LegacyPatientFields({
  value,
  onChange,
  errors,
  onPickExisting,
}: {
  value: LegacyPatientInput;
  onChange: (next: LegacyPatientInput) => void;
  errors: LegacyPatientErrors;
  onPickExisting: (patient: PatientSummary) => void;
}) {
  const [duplicates, setDuplicates] = useState<PatientSummary[]>([]);
  const [checked, setChecked] = useState<{ nik: string; result: NikResult } | null>(null);
  const [, startDuplicateCheck] = useTransition();
  const update = (patch: Partial<LegacyPatientInput>) => onChange({ ...value, ...patch });
  const typedNik = value.nik.trim() ? normalizeNik(value.nik) : null;

  useEffect(() => {
    if (!typedNik) return;
    let current = true;
    checkPatientNik(typedNik)
      .then((result) => {
        if (!current) return;
        if (!result.ok) setChecked({ nik: typedNik, result: "ERROR" });
        else setChecked({ nik: typedNik, result: result.data.status === "FREE" ? "FREE" : { patient: result.data.patient, birthDateLabel: result.data.birthDateLabel } });
      })
      .catch(() => current && setChecked({ nik: typedNik, result: "ERROR" }));
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

  function checkDuplicate() {
    if (!value.whatsapp.trim()) {
      setDuplicates([]);
      return;
    }
    startDuplicateCheck(async () => {
      try {
        setDuplicates(await findPatientsByWhatsapp(value.whatsapp));
      } catch {
        // Hanya peringatan; kegagalannya tidak menghalangi penyimpanan.
        setDuplicates([]);
      }
    });
  }

  return (
    <Stack spacing={2}>
      <TextField id="legacy-patient-name" label="Nama pasien" value={value.name} onChange={(e) => update({ name: e.target.value })} error={!!errors.name} helperText={errors.name} fullWidth />
      <TextField
        id="legacy-patient-whatsapp"
        label="No. HP (WhatsApp)"
        value={value.whatsapp}
        onChange={(e) => update({ whatsapp: e.target.value })}
        onBlur={checkDuplicate}
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
            {duplicates.map((patient) => (
              <Box component="li" key={patient.id} sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <span>
                  <strong>{patient.name}</strong> · {patient.medicalRecordNumber}
                </span>
                <Button type="button" size="small" variant="outlined" onClick={() => onPickExisting(patient)}>
                  Pakai pasien ini
                </Button>
              </Box>
            ))}
          </Box>
        </Alert>
      )}
      <Box>
        <TextField
          id="legacy-patient-nik"
          label="NIK (opsional)"
          value={value.nik}
          onChange={(e) => update({ nik: e.target.value })}
          slotProps={{ htmlInput: { inputMode: "numeric" } }}
          error={!!errors.nik}
          helperText={errors.nik}
          fullWidth
        />
        <NikCheckPanel state={nikState} onPickExisting={onPickExisting} />
      </Box>
      <DateField id="legacy-patient-birth" label="Tanggal lahir (opsional)" value={value.birthDate} onChange={(birthDate) => update({ birthDate })} error={!!errors.birthDate} helperText={errors.birthDate} fullWidth />
      <SelectField id="legacy-patient-gender" label="Jenis kelamin (opsional)" value={value.gender ?? ""} onChange={(gender) => update({ gender: gender || null })} error={!!errors.gender} helperText={errors.gender}>
        <option value="">—</option>
        <option value="L">Laki-laki</option>
        <option value="P">Perempuan</option>
      </SelectField>
      <TextField id="legacy-patient-address" label="Alamat (opsional)" value={value.address} onChange={(e) => update({ address: e.target.value })} error={!!errors.address} helperText={errors.address} fullWidth />
      <TextField id="legacy-patient-email" label="Email (opsional)" value={value.email} onChange={(e) => update({ email: e.target.value })} error={!!errors.email} helperText={errors.email} fullWidth />
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <TextField
          id="legacy-patient-emergency-name"
          label="Kontak darurat (opsional)"
          value={value.emergencyContactName}
          onChange={(e) => update({ emergencyContactName: e.target.value })}
          error={!!errors.emergencyContactName}
          helperText={errors.emergencyContactName}
          fullWidth
        />
        <TextField
          id="legacy-patient-emergency-phone"
          label="No. kontak darurat"
          value={value.emergencyContactPhone}
          onChange={(e) => update({ emergencyContactPhone: e.target.value })}
          slotProps={{ htmlInput: { inputMode: "tel" } }}
          error={!!errors.emergencyContactPhone}
          helperText={errors.emergencyContactPhone}
          fullWidth
        />
      </Stack>
    </Stack>
  );
}
