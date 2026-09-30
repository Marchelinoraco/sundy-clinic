"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type ReactNode } from "react";
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
import {
  ENCOUNTER_TEXT_MAX,
  FINALIZE_NEEDS_ASSESSMENT,
  TEXT_FIELDS,
  TREATMENT_TEXT_MAX,
  VITALS,
  VITAL_KEYS,
  bmi,
  formatDecimal,
  parseEncounterDraft,
  parseVital,
  type EncounterDraftInput,
  type EncounterOptions,
  type TextKey,
  type TreatmentInput,
  type VitalKey,
} from "@/lib/encounter";
import { minutesToTimeLabel, witaMinutesOfDay } from "@/lib/time";
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

function TextField({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        maxLength={ENCOUNTER_TEXT_MAX}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
      />
    </div>
  );
}

function VitalField({ vital, value, onChange }: { vital: VitalKey; value: string; onChange: (value: string) => void }) {
  const id = useId();
  const spec = VITALS[vital];
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>
        {spec.label} ({spec.unit})
      </Label>
      <Input
        id={id}
        inputMode={spec.decimals === 0 ? "numeric" : "decimal"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
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

export type EncounterFormProps = {
  encounterId: string;
  initialVersion: string;
  initialDraft: EncounterDraftInput;
  options: EncounterOptions;
  /** Isian kuis kunjungan ini, ditampilkan di bagian S. */
  intakeSlot: ReactNode;
  autosaveDelayMs?: number;
  retryDelaysMs?: readonly number[];
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
  const setVital = (key: VitalKey, value: string) => update({ ...draft, vitals: { ...draft.vitals, [key]: value } });
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

  const weight = parseVital("weightKg", draft.vitals.weightKg);
  const height = parseVital("heightCm", draft.vitals.heightCm);
  const index = weight.ok && height.ok ? bmi(weight.value, height.value) : null;

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
        {props.intakeSlot}
        <TextField label={TEXT_FIELDS.subjective} value={draft.subjective} onChange={(v) => setText("subjective", v)} rows={4} />
      </section>

      <section aria-labelledby="bagian-o" className="space-y-3">
        <h2 id="bagian-o" className="text-base font-medium">
          O — Objective
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {VITAL_KEYS.map((key) => (
            <VitalField key={key} vital={key} value={draft.vitals[key]} onChange={(v) => setVital(key, v)} />
          ))}
        </div>
        <p className="text-sm">IMT {index === null ? "—" : formatDecimal(index)}</p>
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

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button onClick={requestFinalize} disabled={busy}>
          Finalisasi
        </Button>
        <Button variant="outline" onClick={() => setConfirm("discard")} disabled={busy}>
          Buang draf
        </Button>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {statusText(autosave.status)}
        </p>
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
