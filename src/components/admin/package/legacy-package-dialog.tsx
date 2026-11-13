"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { defaultNextVisit, usedFromVisits, validateLegacyPackage, type LegacyCatalogPackage, type LegacyPackageForm } from "@/lib/legacy-package";
import { firstLegacyPatientError, validateLegacyPatient, type LegacyPatientErrors, type LegacyPatientInput } from "@/lib/patient-registration";
import { dateLabel } from "@/lib/stock";
import { createLegacyPackage, findLegacyDuplicates, type LegacyDuplicate } from "@/server/legacy-packages";
import type { PatientSummary } from "@/server/patient";
import { DateField } from "../mui/date-field";
import { DialogCloseButton } from "../mui/dialog-close-button";
import { TextLink } from "../mui/links";
import { SelectField } from "../mui/select-field";
import { PatientPicker } from "../patient-picker";
import { EMPTY_LEGACY_PATIENT, LegacyPatientFields } from "./legacy-patient-fields";

type Saved = { patientPackageId: string; summary: string };

/**
 * "+ Paket lama (Kluto)" (spec paket lama bagian 4): Resepsionis/Super Admin mengetik paket lama dari layar Kluto. Dialog
 * bisa dipakai berulang lewat "Tambah paket lama lain" agar ±100 paket cepat dicicil.
 */
export function LegacyPackageDialog({ catalog, today }: { catalog: LegacyCatalogPackage[]; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [newPatient, setNewPatient] = useState<LegacyPatientInput>(EMPTY_LEGACY_PATIENT);
  const [patientErrors, setPatientErrors] = useState<LegacyPatientErrors>({});
  const [packageId, setPackageId] = useState("");
  const [boughtOn, setBoughtOn] = useState("");
  // Wajib diisi (spec bagian 4.4): kosong di awal, sehingga melewatinya ditolak dan tidak diam-diam berarti "belum dipakai".
  const [visits, setVisits] = useState("");
  const [used, setUsed] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<string[]>([]);
  const [nextVisitOn, setNextVisitOn] = useState("");
  const [note, setNote] = useState("");
  const [duplicates, setDuplicates] = useState<LegacyDuplicate[]>([]);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [pending, startTransition] = useTransition();

  const pkg = catalog.find((row) => row.id === packageId) ?? null;
  const patientId = patient?.id ?? null;

  useEffect(() => {
    if (!patientId || !packageId) return;
    let current = true;
    findLegacyDuplicates({ patientId, packageId })
      .then((result) => current && setDuplicates(result.ok ? result.data : []))
      .catch(() => current && setDuplicates([]));
    return () => {
      current = false;
    };
  }, [patientId, packageId]);

  function reset() {
    setPatient(null);
    setIsNew(false);
    setNewPatient(EMPTY_LEGACY_PATIENT);
    setPatientErrors({});
    setPackageId("");
    setBoughtOn("");
    setVisits("");
    setUsed({});
    setTouched([]);
    setNextVisitOn("");
    setNote("");
    setDuplicates([]);
    setConfirmDuplicate(false);
    setError(null);
    setSaved(null);
  }

  function choosePatient(next: PatientSummary) {
    setPatient(next);
    setIsNew(false);
    setPatientErrors({});
    setDuplicates([]);
    setConfirmDuplicate(false);
  }

  /** "Ganti": peringatan paket ganda milik pasien sebelumnya tidak boleh tertinggal. */
  function changePatient() {
    setPatient(null);
    setDuplicates([]);
    setConfirmDuplicate(false);
  }

  function choosePackage(id: string) {
    const chosen = catalog.find((row) => row.id === id) ?? null;
    setPackageId(id);
    setTouched([]);
    setDuplicates([]);
    setConfirmDuplicate(false);
    const count = Number(visits) || 0;
    const filled = chosen ? usedFromVisits(chosen.items, count) : [];
    setUsed(Object.fromEntries((chosen?.items ?? []).map((item, index) => [item.id, String(filled[index])])));
    setNextVisitOn(chosen ? defaultNextVisit(today, chosen.visitIntervalDays) : "");
  }

  function changeVisits(text: string) {
    setVisits(text);
    if (!pkg) return;
    const filled = usedFromVisits(pkg.items, Number(text) || 0);
    setUsed((current) => Object.fromEntries(pkg.items.map((item, index) => [item.id, touched.includes(item.id) ? current[item.id] : String(filled[index])])));
  }

  function changeUsed(itemId: string, text: string) {
    setUsed((current) => ({ ...current, [itemId]: text }));
    setTouched((current) => (current.includes(itemId) ? current : [...current, itemId]));
  }

  const asNumber = (text: string | undefined) => (text === undefined || text.trim() === "" ? Number.NaN : Number(text));

  function save() {
    setError(null);
    if (!patient && !isNew) {
      setError("Pilih pasien.");
      return;
    }
    if (isNew) {
      const checkedPatient = validateLegacyPatient(newPatient, today);
      if (!checkedPatient.ok) {
        setPatientErrors(checkedPatient.errors);
        setError(firstLegacyPatientError(checkedPatient.errors));
        return;
      }
      setPatientErrors({});
    }
    const form: LegacyPackageForm = {
      packageId,
      boughtOn,
      priorVisits: asNumber(visits),
      used: Object.fromEntries((pkg?.items ?? []).map((item) => [item.id, asNumber(used[item.id])])),
      nextVisitOn: nextVisitOn || null,
      note,
      confirmDuplicate,
    };
    const checked = validateLegacyPackage(form, { today, items: pkg?.items ?? [] });
    if (!checked.ok) {
      setError(checked.message);
      return;
    }
    startTransition(async () => {
      try {
        const result = await createLegacyPackage({ patient: isNew ? { new: newPatient } : { id: patient!.id }, form });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setSaved({ patientPackageId: result.data.patientPackageId, summary: result.data.summary });
        router.refresh();
      } catch {
        setError("Gagal menyimpan. Coba lagi.");
      }
    });
  }

  const blockedByDuplicate = duplicates.length > 0 && !confirmDuplicate;

  return (
    <>
      <Button type="button" variant="outlined" onClick={() => (reset(), setOpen(true))}>
        + Paket lama (Kluto)
      </Button>
      <Dialog open={open} onClose={() => !pending && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pr: 6 }}>Paket lama (Kluto)</DialogTitle>
        <DialogCloseButton onClick={() => setOpen(false)} />
        <DialogContent>
          {saved ? (
            <Alert severity="success">
              <Box component="p" sx={{ mt: 0, mb: 1 }}>
                {saved.summary}
              </Box>
              <TextLink href={`/admin/paket/${saved.patientPackageId}`}>Lihat paket</TextLink>
            </Alert>
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <DialogContentText>Salin dari layar Kluto: pasien, paket, tanggal beli, dan yang sudah dipakai. Sisanya langsung bisa dipakai di tagihan.</DialogContentText>

              {patient ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
                  <Typography sx={{ fontWeight: 500 }}>
                    {patient.name} · {patient.medicalRecordNumber}
                  </Typography>
                  <Button type="button" size="small" onClick={changePatient}>
                    Ganti
                  </Button>
                </Stack>
              ) : (
                <>
                  <FormControlLabel
                    control={<Checkbox checked={isNew} onChange={(event) => setIsNew(event.target.checked)} />}
                    label="Pasien belum ada di SunDY"
                  />
                  {isNew ? (
                    <LegacyPatientFields value={newPatient} onChange={setNewPatient} errors={patientErrors} onPickExisting={choosePatient} />
                  ) : (
                    <PatientPicker onSelect={choosePatient} allowNew={false} />
                  )}
                </>
              )}

              {(patient || isNew) && (
                <>
                  <SelectField id="legacy-package" label="Paket" value={packageId} onChange={choosePackage}>
                    <option value="">Pilih paket…</option>
                    {catalog.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.isActive ? row.name : `${row.name} · tidak dijual lagi`}
                      </option>
                    ))}
                  </SelectField>
                  {pkg && (
                    <>
                      <DateField id="legacy-bought-on" label="Tanggal beli di Kluto" value={boughtOn} onChange={setBoughtOn} max={today} fullWidth />
                      <TextField
                        id="legacy-visits"
                        type="number"
                        label="Jumlah kunjungan di Kluto"
                        value={visits}
                        onChange={(event) => changeVisits(event.target.value)}
                        helperText="Dihitung dari catatan kunjungan di Kluto. Angka di bawah terisi otomatis dan bisa diubah."
                        slotProps={{ htmlInput: { min: 0 } }}
                        fullWidth
                      />
                      {pkg.items.map((item) => {
                        const value = used[item.id] ?? "";
                        const left = item.sessions - (Number(value) || 0);
                        const verb = item.unit ? "Sudah diambil" : "Sudah dipakai";
                        return (
                          <TextField
                            key={item.id}
                            id={`legacy-used-${item.id}`}
                            type="number"
                            label={`${verb} ${item.name}`}
                            value={value}
                            onChange={(event) => changeUsed(item.id, event.target.value)}
                            helperText={`dari ${item.sessions} ${item.unit ?? "sesi"} · Sisa ${left}`}
                            slotProps={{ htmlInput: { min: 0, max: item.sessions } }}
                            fullWidth
                          />
                        );
                      })}
                      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
                        <DateField
                          id="legacy-next-visit"
                          label="Kunjungan berikutnya"
                          value={nextVisitOn}
                          onChange={setNextVisitOn}
                          min={today}
                          helperText="Kosong = belum diingatkan di Pengingat."
                          fullWidth
                        />
                        <Button type="button" onClick={() => setNextVisitOn("")} sx={{ mt: 1 }}>
                          Kosongkan
                        </Button>
                      </Stack>
                      <TextField id="legacy-note" label="Catatan (opsional)" value={note} onChange={(event) => setNote(event.target.value)} placeholder="mis. nomor nota Kluto" fullWidth />
                    </>
                  )}
                </>
              )}

              {duplicates.length > 0 && (
                <Alert severity="warning">
                  <Box component="p" sx={{ mt: 0, mb: 0.5 }}>
                    Pasien ini sudah punya paket lama ini:
                  </Box>
                  <Box component="ul" sx={{ m: 0, pl: 2 }}>
                    {duplicates.map((row) => (
                      <li key={row.patientPackageId}>
                        dimasukkan {row.staffName} {dateLabel(row.enteredOn)} · sisa {row.remainingLabel}
                      </li>
                    ))}
                  </Box>
                  <FormControlLabel
                    control={<Checkbox checked={confirmDuplicate} onChange={(event) => setConfirmDuplicate(event.target.checked)} />}
                    label="Ini paket yang berbeda"
                  />
                </Alert>
              )}
              {error && <Alert severity="error">{error}</Alert>}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          {saved ? (
            <Button type="button" variant="contained" onClick={reset}>
              Tambah paket lama lain
            </Button>
          ) : (
            <Button type="button" variant="contained" disabled={pending || blockedByDuplicate} onClick={save}>
              Simpan
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
