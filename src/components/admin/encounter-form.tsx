"use client";

import { useRouter } from "next/navigation";
import { useId, useImperativeHandle, useState, useTransition, type Ref } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { discardEncounterDraft, finalizeEncounter, saveEncounterDraft } from "@/server/encounter";
import { useDraftAutosave, type AutosaveStatus } from "./use-draft-autosave";

const textareaClass =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

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

function TextField({
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
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea id={id} rows={rows} maxLength={maxLength} value={value} onChange={(e) => onChange(e.target.value)} className={textareaClass} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function VitalField(props: { vital: VitalKey; value: string; error: string | null; onChange: (value: string) => void }) {
  const id = useId();
  const spec = VITALS[props.vital];
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {spec.label} ({spec.unit})
      </Label>
      <Input
        id={id}
        inputMode={spec.decimals === 0 ? "numeric" : "decimal"}
        value={props.value}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? `${id}-error` : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {props.error}
        </p>
      )}
    </div>
  );
}

function TreatmentFields(props: {
  index: number;
  value: TreatmentInput;
  options: EncounterOptions;
  onChange: (patch: Partial<TreatmentInput>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const { index, value, options } = props;
  return (
    <fieldset className="space-y-3 rounded-md border p-3">
      <legend className="px-1 text-sm font-medium">Treatment {index + 1}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-service`}>Treatment</Label>
          <select
            id={`${id}-service`}
            className={selectClass}
            value={value.serviceId}
            onChange={(e) => props.onChange({ serviceId: e.target.value })}
          >
            {options.services.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-performer`}>Pelaksana</Label>
          <select
            id={`${id}-performer`}
            className={selectClass}
            value={value.performerId}
            onChange={(e) => props.onChange({ performerId: e.target.value })}
          >
            {options.performers.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-area`}>Area</Label>
          <Input
            id={`${id}-area`}
            maxLength={TREATMENT_TEXT_MAX.area}
            value={value.area}
            onChange={(e) => props.onChange({ area: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-dose`}>Dosis</Label>
          <Input
            id={`${id}-dose`}
            maxLength={TREATMENT_TEXT_MAX.dose}
            placeholder="mis. 12 unit"
            value={value.dose}
            onChange={(e) => props.onChange({ dose: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-notes`}>Catatan pasca-tindakan</Label>
        <textarea
          id={`${id}-notes`}
          rows={2}
          maxLength={TREATMENT_TEXT_MAX.notes}
          value={value.notes}
          onChange={(e) => props.onChange({ notes: e.target.value })}
          className={textareaClass}
        />
      </div>
      <Button type="button" variant="outline" size="sm" onClick={props.onRemove}>
        Hapus treatment {index + 1}
      </Button>
    </fieldset>
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
    <div className="space-y-6">
      <section aria-labelledby="bagian-s" className="space-y-3">
        <h2 id="bagian-s" className="text-base font-medium">
          S — Subjective
        </h2>
        <TextField label={TEXT_FIELDS.subjective} value={draft.subjective} onChange={(v) => setText("subjective", v)} rows={4} />
      </section>

      <section aria-labelledby="bagian-o" className="space-y-3">
        <h2 id="bagian-o" className="text-base font-medium">
          O — Objective
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VITAL_KEYS.map((key) => (
            <VitalField
              key={key}
              vital={key}
              value={draft.vitals[key]}
              error={vitalErrors[key]}
              onChange={(v) => setVital(key, v)}
            />
          ))}
        </div>
        {pressureError && <p className="text-sm text-destructive">{pressureError}</p>}
        <p className="text-sm">
          IMT {index === null ? "—" : formatDecimal(index)}
          {weightNote ? ` · ${weightNote}` : ""}
        </p>
        <TextField label={TEXT_FIELDS.physicalExam} value={draft.physicalExam} onChange={(v) => setText("physicalExam", v)} />
      </section>

      <section aria-labelledby="bagian-a" className="space-y-3">
        <h2 id="bagian-a" className="text-base font-medium">
          A — Assessment
        </h2>
        <TextField label={TEXT_FIELDS.assessment} value={draft.assessment} onChange={(v) => setText("assessment", v)} />
      </section>

      <section aria-labelledby="bagian-p" className="space-y-3">
        <h2 id="bagian-p" className="text-base font-medium">
          P — Plan
        </h2>
        <TextField label={TEXT_FIELDS.plan} value={draft.plan} onChange={(v) => setText("plan", v)} />
        <TextField
          label={TEXT_FIELDS.pharmacyNote}
          value={draft.pharmacyNote}
          onChange={(v) => setText("pharmacyNote", v)}
          rows={2}
          maxLength={PHARMACY_NOTE_MAX}
          hint="Diisi bila pasien perlu obat. Apoteker hanya membaca kolom ini, bukan catatan klinis lain."
        />
      </section>

      <section aria-labelledby="bagian-treatment" className="space-y-3">
        <h2 id="bagian-treatment" className="text-base font-medium">
          Treatment yang dilakukan
        </h2>
        {draft.treatments.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada treatment di kunjungan ini.</p>
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
        <Button type="button" variant="outline" onClick={addTreatment}>
          Tambah treatment
        </Button>
      </section>

      <div
        data-slot="encounter-actions"
        className="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t bg-background/95 py-3 backdrop-blur"
      >
        <p
          role="status"
          aria-live="polite"
          className={cn("mr-auto text-sm", rejected ? "font-medium text-destructive" : "text-muted-foreground")}
        >
          {statusText(autosave.status)}
        </p>
        <Button variant="outline" onClick={() => setConfirm("discard")} disabled={busy}>
          Buang draf
        </Button>
        <Button onClick={requestFinalize} disabled={busy}>
          Finalisasi
        </Button>
      </div>

      <AlertDialog open={confirm === "finalize"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Finalisasi catatan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Catatan yang sudah final tidak bisa diubah, hanya bisa ditambah adendum. Booking ditandai Selesai.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction onClick={finalize}>Finalisasi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "discard"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Buang draf kunjungan ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Isi draf dan treatment-nya dihapus. Pasien kembali tampil sebagai belum diperiksa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={discard}>
              Buang draf
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
