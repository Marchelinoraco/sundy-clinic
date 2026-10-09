"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useImperativeHandle, useState, useTransition, type ReactNode, type Ref } from "react";
import { toast } from "sonner";
import { appendToSubjective } from "@/lib/food-recall";
import {
  ENCOUNTER_TEXT_MAX,
  FINALIZE_NEEDS_ASSESSMENT,
  PHARMACY_NOTE_MAX,
  TEXT_FIELDS,
  TREATMENT_TEXT_MAX,
  VITALS,
  VITAL_KEYS,
  bloodPressureProblem,
  bmi,
  formatDecimal,
  parseEncounterDraft,
  parseVital,
  parseVitalValues,
  weightChangeNote,
  type EncounterDraftInput,
  type EncounterOptions,
  type TextKey,
  type TreatmentInput,
  type TrendSource,
  type VitalKey,
} from "@/lib/encounter";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
import { discardEncounterDraft, finalizeEncounter, saveEncounterDraft } from "@/server/encounter";
import { SelectField } from "./mui/select-field";
import { useDraftAutosave, type AutosaveStatus } from "./use-draft-autosave";

function statusText(status: AutosaveStatus): string {
  switch (status.kind) {
    case "idle":
      return "Draf tersimpan otomatis saat Anda mengetik.";
    case "pending":
      return "Menyimpan…";
    case "saved":
      return `Tersimpan ${minutesToTimeLabel(witaMinutesOfDay(new Date(status.savedAt)))}`;
    case "retrying":
      return "Belum tersimpan, mencoba lagi…";
    case "rejected":
      return `Belum tersimpan: ${status.message}`;
  }
}

function NoteField({
  label,
  value,
  onChange,
  rows = 3,
  maxLength = ENCOUNTER_TEXT_MAX,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength?: number;
  hint?: string;
}) {
  return (
    <TextField
      label={label}
      multiline
      minRows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      helperText={hint}
      fullWidth
      slotProps={{ htmlInput: { maxLength } }}
    />
  );
}

function VitalField(props: { vital: VitalKey; value: string; error: string | null; onChange: (value: string) => void }) {
  const spec = VITALS[props.vital];
  return (
    <TextField
      label={`${spec.label} (${spec.unit})`}
      value={props.value}
      error={props.error !== null}
      helperText={props.error}
      onChange={(e) => props.onChange(e.target.value)}
      fullWidth
      slotProps={{ htmlInput: { inputMode: spec.decimals === 0 ? "numeric" : "decimal" } }}
    />
  );
}

function TreatmentFields(props: {
  index: number;
  value: TreatmentInput;
  options: EncounterOptions;
  onChange: (patch: Partial<TreatmentInput>) => void;
  onRemove: () => void;
}) {
  const { index, value, options } = props;
  return (
    <Paper component="fieldset" variant="outlined" sx={{ m: 0, p: 1.5, minWidth: 0 }}>
      <Box component="legend" sx={{ px: 0.5, fontSize: "0.875rem", fontWeight: 500 }}>
        Treatment {index + 1}
      </Box>
      <Stack spacing={1.5}>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
          <SelectField label="Treatment" value={value.serviceId} onChange={(serviceId) => props.onChange({ serviceId })}>
            {options.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Pelaksana" value={value.performerId} onChange={(performerId) => props.onChange({ performerId })}>
            {options.performers.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Area"
            value={value.area}
            onChange={(e) => props.onChange({ area: e.target.value })}
            fullWidth
            slotProps={{ htmlInput: { maxLength: TREATMENT_TEXT_MAX.area } }}
          />
          <TextField
            label="Dosis"
            placeholder="mis. 12 unit"
            value={value.dose}
            onChange={(e) => props.onChange({ dose: e.target.value })}
            fullWidth
            slotProps={{ htmlInput: { maxLength: TREATMENT_TEXT_MAX.dose } }}
          />
        </Box>
        <TextField
          label="Catatan pasca-tindakan"
          multiline
          minRows={2}
          value={value.notes}
          onChange={(e) => props.onChange({ notes: e.target.value })}
          fullWidth
          slotProps={{ htmlInput: { maxLength: TREATMENT_TEXT_MAX.notes } }}
        />
        <Box>
          <Button type="button" variant="outlined" size="small" onClick={props.onRemove}>
            Hapus treatment {index + 1}
          </Button>
        </Box>
      </Stack>
    </Paper>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <Stack component="section" aria-labelledby={id} spacing={1.5}>
      <Typography id={id} component="h2" sx={{ fontSize: "1rem", fontWeight: 500 }}>
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/** Pegangan kolom S untuk tab food recall (spec check-in 5.2). */
export type SubjectiveHandle = { text: () => string; append: (block: string) => boolean };

export type EncounterFormProps = {
  encounterId: string;
  initialVersion: string;
  initialDraft: EncounterDraftInput;
  options: EncounterOptions;
  /** Kunjungan final sebelumnya (terbaru dulu), untuk selisih berat di baris IMT. */
  weightHistory?: TrendSource[];
  /** Dipanggil setiap angka vital berubah, agar tab Tren ikut berubah. */
  onVitalsChange?: (values: Record<VitalKey, number | null>) => void;
  autosaveDelayMs?: number;
  retryDelaysMs?: readonly number[];
  /** Tab food recall menambahkan ringkasan ke S lewat pegangan ini. */
  subjectiveRef?: Ref<SubjectiveHandle>;
  /** Ada angka BIA yang diketik tetapi belum disimpan di tab BIA (spec hasil BIA 6.2). */
  biaUnsaved?: boolean;
};

/** Catatan draf S/O/A/P + treatment dengan simpan otomatis (spec 4–5, 7). */
export function EncounterForm(props: EncounterFormProps) {
  const { encounterId, options } = props;
  const router = useRouter();
  const [draft, setDraft] = useState(props.initialDraft);
  const [confirm, setConfirm] = useState<"finalize" | "discard" | null>(null);
  const [busy, startTransition] = useTransition();
  const autosave = useDraftAutosave<EncounterDraftInput>({
    initialVersion: props.initialVersion,
    save: (version, value) => saveEncounterDraft({ encounterId, version, draft: value }),
    validate: (value) => {
      const parsed = parseEncounterDraft(value);
      return parsed.ok ? null : parsed.message;
    },
    delayMs: props.autosaveDelayMs,
    retryDelaysMs: props.retryDelaysMs,
  });

  function update(next: EncounterDraftInput) {
    setDraft(next);
    autosave.change(next);
  }
  const setText = (key: TextKey, value: string) => update({ ...draft, [key]: value });
  // Tanpa daftar dependensi: pegangan selalu membaca draf terbaru.
  useImperativeHandle(props.subjectiveRef, () => ({
    text: () => draft.subjective,
    append: (block: string) => {
      const next = appendToSubjective(draft.subjective, block);
      if (next.length > ENCOUNTER_TEXT_MAX) return false;
      update({ ...draft, subjective: next });
      return true;
    },
  }));
  const setVital = (key: VitalKey, value: string) => {
    const next = { ...draft, vitals: { ...draft.vitals, [key]: value } };
    update(next);
    props.onVitalsChange?.(parseVitalValues(next.vitals));
  };
  const setTreatment = (index: number, patch: Partial<TreatmentInput>) =>
    update({ ...draft, treatments: draft.treatments.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const addTreatment = () =>
    update({
      ...draft,
      treatments: [
        ...draft.treatments,
        { serviceId: options.defaultServiceId, area: "", dose: "", performerId: options.defaultPerformerId, notes: "" },
      ],
    });
  const removeTreatment = (index: number) =>
    update({ ...draft, treatments: draft.treatments.filter((_, i) => i !== index) });

  // Angka yang tidak sah menahan simpan otomatis; tandai kolomnya begitu simpan ditolak,
  // bukan di setiap ketikan, agar "1" dalam perjalanan ke "120" tidak langsung merah.
  const rejected = autosave.status.kind === "rejected";
  const vitalValues = {} as Record<VitalKey, number | null>;
  const vitalErrors = {} as Record<VitalKey, string | null>;
  for (const key of VITAL_KEYS) {
    const parsed = parseVital(key, draft.vitals[key]);
    vitalValues[key] = parsed.ok ? parsed.value : null;
    vitalErrors[key] = rejected && !parsed.ok ? parsed.message : null;
  }
  const pressureError =
    rejected && VITAL_KEYS.every((key) => vitalErrors[key] === null)
      ? bloodPressureProblem(vitalValues.systolic, vitalValues.diastolic)
      : null;
  const index = bmi(vitalValues.weightKg, vitalValues.heightCm);
  const weightNote = weightChangeNote(vitalValues.weightKg, props.weightHistory ?? []);

  function requestFinalize() {
    const parsed = parseEncounterDraft(draft);
    if (!parsed.ok) {
      toast.error(parsed.message);
      return;
    }
    if (!parsed.value.assessment) {
      toast.error(FINALIZE_NEEDS_ASSESSMENT);
      return;
    }
    setConfirm("finalize");
  }

  function finalize() {
    setConfirm(null);
    startTransition(async () => {
      const version = await autosave.settle();
      try {
        const result = await finalizeEncounter({ encounterId, version, draft });
        if (!result.ok) {
          toast.error(result.error);
          autosave.change(draft);
          return;
        }
        autosave.forget();
        toast.success("Catatan difinalisasi.");
        router.refresh();
      } catch {
        toast.error("Gagal memfinalisasi. Coba lagi.");
        autosave.change(draft);
      }
    });
  }

  function discard() {
    setConfirm(null);
    startTransition(async () => {
      const version = await autosave.settle();
      try {
        const result = await discardEncounterDraft({ encounterId, version });
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        autosave.forget();
        toast.success("Draf dibuang.");
        router.push("/admin");
      } catch {
        toast.error("Gagal membuang draf. Coba lagi.");
      }
    });
  }

  return (
    <Stack spacing={3}>
      <Section id="bagian-s" title="S — Subjective">
        <NoteField label={TEXT_FIELDS.subjective} value={draft.subjective} onChange={(v) => setText("subjective", v)} rows={4} />
      </Section>

      <Section id="bagian-o" title="O — Objective">
        {/* Dua kolom paling banyak: label MUI ada di dalam isian dan tidak bisa turun baris, jadi kolom sempit
            memotong satuannya ("Lingkar pinggang/perut (cm)"). */}
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)" } }}>
          {VITAL_KEYS.map((key) => (
            <VitalField
              key={key}
              vital={key}
              value={draft.vitals[key]}
              error={vitalErrors[key]}
              onChange={(v) => setVital(key, v)}
            />
          ))}
        </Box>
        {pressureError && (
          <Typography variant="body2" sx={{ color: "error.main" }}>
            {pressureError}
          </Typography>
        )}
        <Typography variant="body2">
          IMT {index === null ? "—" : formatDecimal(index)}
          {weightNote ? ` · ${weightNote}` : ""}
        </Typography>
        <NoteField label={TEXT_FIELDS.physicalExam} value={draft.physicalExam} onChange={(v) => setText("physicalExam", v)} />
      </Section>

      <Section id="bagian-a" title="A — Assessment">
        <NoteField label={TEXT_FIELDS.assessment} value={draft.assessment} onChange={(v) => setText("assessment", v)} />
      </Section>

      <Section id="bagian-p" title="P — Plan">
        <NoteField label={TEXT_FIELDS.plan} value={draft.plan} onChange={(v) => setText("plan", v)} />
        <NoteField
          label={TEXT_FIELDS.pharmacyNote}
          value={draft.pharmacyNote}
          onChange={(v) => setText("pharmacyNote", v)}
          rows={2}
          maxLength={PHARMACY_NOTE_MAX}
          hint="Diisi bila pasien perlu obat. Apoteker hanya membaca kolom ini, bukan catatan klinis lain."
        />
      </Section>

      <Section id="bagian-treatment" title="Treatment yang dilakukan">
        {draft.treatments.length === 0 && (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Belum ada treatment di kunjungan ini.
          </Typography>
        )}
        {draft.treatments.map((row, i) => (
          <TreatmentFields
            key={i}
            index={i}
            value={row}
            options={options}
            onChange={(patch) => setTreatment(i, patch)}
            onRemove={() => removeTreatment(i)}
          />
        ))}
        <Box>
          <Button type="button" variant="outlined" onClick={addTreatment}>
            Tambah treatment
          </Button>
        </Box>
      </Section>

      <Stack
        data-slot="encounter-actions"
        direction="row"
        spacing={1.5}
        useFlexGap
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: 10,
          flexWrap: "wrap",
          alignItems: "center",
          borderTop: 1,
          borderColor: "divider",
          bgcolor: "rgba(var(--mui-palette-background-defaultChannel) / 0.95)",
          backdropFilter: "blur(8px)",
          py: 1.5,
          // Ruang untuk tombol bunyi notifikasi yang mengambang di pojok kanan bawah.
          pr: 6,
        }}
      >
        <Typography
          role="status"
          aria-live="polite"
          data-tone={rejected ? "error" : undefined}
          variant="body2"
          sx={{ mr: "auto", color: rejected ? "error.main" : "text.secondary", fontWeight: rejected ? 500 : undefined }}
        >
          {statusText(autosave.status)}
        </Typography>
        {/* Kedua tombol turun baris bersama (rata kanan) bila pesan status panjang. */}
        <Stack direction="row" spacing={1.5} sx={{ ml: "auto" }}>
          <Button variant="outlined" onClick={() => setConfirm("discard")} disabled={busy}>
            Buang draf
          </Button>
          <Button variant="contained" onClick={requestFinalize} disabled={busy}>
            Finalisasi
          </Button>
        </Stack>
      </Stack>

      <Dialog open={confirm === "finalize"} onClose={() => setConfirm(null)} maxWidth="xs" slotProps={{ paper: { role: "alertdialog" } }}>
        <DialogTitle>Finalisasi catatan ini?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Catatan yang sudah final tidak bisa diubah, hanya bisa ditambah adendum. Booking ditandai Selesai.
          </DialogContentText>
          {props.biaUnsaved && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Angka BIA yang Anda ketik belum disimpan. Kembali, buka tab BIA, lalu tekan Simpan angka BIA.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Kembali</Button>
          <Button variant="contained" onClick={finalize}>
            Finalisasi
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={confirm === "discard"} onClose={() => setConfirm(null)} maxWidth="xs" slotProps={{ paper: { role: "alertdialog" } }}>
        <DialogTitle>Buang draf kunjungan ini?</DialogTitle>
        <DialogContent>
          <DialogContentText>Isi draf dan treatment-nya dihapus. Pasien kembali tampil sebagai belum diperiksa.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Kembali</Button>
          <Button variant="contained" color="error" onClick={discard}>
            Buang draf
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
