"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HealthAnswers, SlimmingAnswers } from "@/lib/kuis/v1/answers";
import { bodyMassIndex, formatDecimal } from "@/lib/kuis/v1/describe";
import {
  CONDITIONS,
  DIET_OUTCOMES,
  DIET_PROGRAMS,
  MEALS,
  MEASURE_LIMITS,
  TEXT_LIMITS,
  WEIGHT_AFTER_DIET,
} from "@/lib/kuis/v1/options";
import { Segmented, optionsOf } from "./choice";

const textareaClass =
  "w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-base text-brown-900 focus:border-gold-500 focus:outline-none";

export function TextAnswer({
  label,
  value,
  onChange,
  maxLength,
  rows = 5,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  maxLength: number;
  rows?: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        rows={rows}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={textareaClass}
      />
    </div>
  );
}

export function ShortText({
  label,
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string) => void;
  maxLength: number;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Angka dengan koma atau titik desimal; di luar batas dianggap belum diisi. */
export function NumberInput({
  label,
  value,
  onChange,
  unit,
  min,
  max,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  unit: string;
  min: number;
  max: number;
}) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? "" : String(value).replace(".", ","));

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          className="max-w-32"
          placeholder={`${min}–${max}`}
          value={text}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            const parsed = Number(raw.replace(",", "."));
            onChange(raw.trim() && Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined);
          }}
        />
        <span className="text-sm text-brown-600">{unit}</span>
      </div>
    </div>
  );
}

type ConditionKey = keyof typeof CONDITIONS;

/** K2: satu kelompok per penyakit — obat & aturan minum, atau "Tidak minum obat" (K5). */
export function MedicationFields({
  conditions,
  value,
  onChange,
}: {
  conditions: { key: ConditionKey; name: string }[];
  value: HealthAnswers["medications"];
  onChange: (next: NonNullable<HealthAnswers["medications"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-3">
      {conditions.map(({ key, name }) => {
        const medication = current[key] ?? {};
        return (
          <fieldset key={key} className="space-y-2 rounded-2xl border border-gold-300 bg-cream-100 p-3">
            <legend className="px-1 text-sm font-semibold text-brown-900">{name}</legend>
            <Input
              aria-label={`Obat untuk ${name}`}
              placeholder="Nama obat & aturan minum"
              maxLength={TEXT_LIMITS.medication}
              value={medication.none ? "" : (medication.text ?? "")}
              disabled={medication.none}
              onChange={(e) => onChange({ ...current, [key]: { text: e.target.value } })}
            />
            <label className="flex items-center gap-2 text-sm text-brown-700">
              <input
                type="checkbox"
                checked={medication.none ?? false}
                onChange={(e) => onChange({ ...current, [key]: e.target.checked ? { none: true } : {} })}
              />
              Tidak minum obat
            </label>
          </fieldset>
        );
      })}
    </div>
  );
}

/** K3: "Tidak ada" atau "Ada" + teks yang wajib diisi bila Ada. */
export function YesNoWithText({
  question,
  placeholder,
  value,
  onChange,
}: {
  question: string;
  placeholder: string;
  value: { has?: boolean; text?: string } | undefined;
  onChange: (next: { has?: boolean; text?: string }) => void;
}) {
  const answer = value?.has === undefined ? undefined : value.has ? "ADA" : "TIDAK";
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-brown-900">{question}</legend>
      <Segmented
        label={question}
        options={[
          { value: "TIDAK", label: "Tidak ada" },
          { value: "ADA", label: "Ada" },
        ]}
        value={answer}
        onChange={(choice) => onChange(choice === "ADA" ? { has: true, text: value?.text } : { has: false })}
      />
      {value?.has && (
        <Input
          aria-label={placeholder}
          placeholder={placeholder}
          maxLength={TEXT_LIMITS.long}
          value={value.text ?? ""}
          onChange={(e) => onChange({ has: true, text: e.target.value })}
        />
      )}
    </fieldset>
  );
}

type DietProgramKey = keyof typeof DIET_PROGRAMS;

/** S6: hasil setiap program diet yang dipilih (K6). */
export function DietResultFields({
  programs,
  value,
  onChange,
}: {
  programs: { key: DietProgramKey; name: string }[];
  value: SlimmingAnswers["dietResults"];
  onChange: (next: NonNullable<SlimmingAnswers["dietResults"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-3">
      {programs.map(({ key, name }) => {
        const result = current[key] ?? {};
        const update = (patch: Partial<typeof result>) => onChange({ ...current, [key]: { ...result, ...patch } });
        const showKg = result.outcome === "BERHASIL" || result.outcome === "MASIH_JALAN";
        return (
          <fieldset key={key} className="space-y-2 rounded-2xl border border-gold-300 bg-cream-100 p-3">
            <legend className="px-1 text-sm font-semibold text-brown-900">{name}</legend>
            <Segmented
              label={`Hasil ${name}`}
              options={optionsOf(DIET_OUTCOMES)}
              value={result.outcome}
              onChange={(outcome) => update({ outcome })}
            />
            {showKg && (
              <NumberInput
                label={`Turun berapa kg? (${name})`}
                unit="kg"
                min={MEASURE_LIMITS.lostKg.min}
                max={MEASURE_LIMITS.lostKg.max}
                value={result.lostKg}
                onChange={(lostKg) => update({ lostKg })}
              />
            )}
            {result.outcome === "BERHASIL" && (
              <div className="space-y-1">
                <p className="text-sm text-brown-700">Sekarang beratnya?</p>
                <Segmented
                  label={`Berat sekarang setelah ${name}`}
                  options={optionsOf(WEIGHT_AFTER_DIET)}
                  value={result.weightAfter}
                  onChange={(weightAfter) => update({ weightAfter })}
                />
              </div>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}

/** S7: berat & tinggi mandiri, dengan IMT sebagai gambaran awal. */
export function MeasureFields({
  weightKg,
  heightCm,
  onChange,
}: {
  weightKg: number | undefined;
  heightCm: number | undefined;
  onChange: (next: { weightKg?: number; heightCm?: number }) => void;
}) {
  return (
    <div className="space-y-4">
      <NumberInput
        label="Berat badan"
        unit="kg"
        min={MEASURE_LIMITS.weightKg.min}
        max={MEASURE_LIMITS.weightKg.max}
        value={weightKg}
        onChange={(next) => onChange({ weightKg: next, heightCm })}
      />
      <NumberInput
        label="Tinggi badan"
        unit="cm"
        min={MEASURE_LIMITS.heightCm.min}
        max={MEASURE_LIMITS.heightCm.max}
        value={heightCm}
        onChange={(next) => onChange({ weightKg, heightCm: next })}
      />
      {weightKg !== undefined && heightCm !== undefined && (
        <p className="rounded-xl bg-cream-100 p-3 text-sm text-brown-700">
          IMT Anda ± <strong>{formatDecimal(bodyMassIndex(weightKg, heightCm))}</strong>. Dokter akan
          memastikannya dengan Timbang BIA di klinik.
        </p>
      )}
    </div>
  );
}

/** S8: food recall seperti Google Form lama (PRD Lampiran C). */
export function FoodRecallFields({
  value,
  onChange,
}: {
  value: SlimmingAnswers["foodRecall"];
  onChange: (next: NonNullable<SlimmingAnswers["foodRecall"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-3">
      {(Object.keys(MEALS) as (keyof typeof MEALS)[]).map((meal) => (
        <ShortText
          key={meal}
          label={MEALS[meal]}
          maxLength={TEXT_LIMITS.long}
          value={current[meal]}
          onChange={(text) => onChange({ ...current, [meal]: text })}
        />
      ))}
    </div>
  );
}
