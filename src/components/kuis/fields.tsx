"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HabitAnswers, HealthAnswers, MealAnswer, SlimmingAnswers } from "@/lib/kuis/v2/answers";
import { bodyMassIndex, formatDecimal } from "@/lib/kuis/v2/describe";
import {
  CONDITIONS,
  DIET_OUTCOMES,
  DIET_PROGRAMS,
  EXERCISE_HOURS,
  EXERCISE_ROUTINES,
  HABIT_LEVELS,
  HABITS,
  MEAL_HOURS,
  MEAL_NONE,
  MEALS,
  MEASURE_LIMITS,
  SLEEP_HOURS,
  SNACK_FREQUENCIES,
  SNACK_HOURS,
  TEXT_LIMITS,
  WAKE_HOURS,
  WEIGHT_AFTER_DIET,
} from "@/lib/kuis/v2/options";
import { minutesToTimeLabel } from "@/lib/time";
import { Segmented, SingleChoice, optionsOf } from "./choice";

const textareaClass =
  "w-full rounded-xl border border-cream-300 bg-white px-3 py-2 text-base text-brown-900 focus:border-gold-500 focus:outline-none";

const selectClass =
  "w-full max-w-40 rounded-xl border border-cream-300 bg-white px-3 py-2 text-base text-brown-900 focus:border-gold-500 focus:outline-none";

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

/** Pilihan jam per jam (mis. 07.00), sama dengan baris tabel dokter. */
export function HourSelect({
  label,
  hours,
  value,
  onChange,
  anytimeLabel,
  anytime = false,
}: {
  label: string;
  hours: readonly number[];
  value: number | undefined;
  onChange: (next: { hour?: number; anytime?: true }) => void;
  /** Bila diisi, daftar mendapat pilihan tambahan tanpa jam (mis. "Tidak tentu"). */
  anytimeLabel?: string;
  anytime?: boolean;
}) {
  const id = useId();
  const current = anytime ? "tidak-tentu" : value === undefined ? "" : String(value);
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectClass}
        value={current}
        onChange={(e) => {
          const next = e.target.value;
          if (next === "tidak-tentu") onChange({ anytime: true });
          else onChange({ hour: next === "" ? undefined : Number(next) });
        }}
      >
        <option value="">Pilih jam</option>
        {hours.map((hour) => (
          <option key={hour} value={hour}>
            {minutesToTimeLabel(hour * 60)}
          </option>
        ))}
        {anytimeLabel && <option value="tidak-tentu">{anytimeLabel}</option>}
      </select>
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

/** T1: berat & tinggi mandiri, dengan IMT sebagai gambaran awal. */
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

/** F1: jam bangun dan jam tidur pada hari biasa. */
export function WakeSleepFields({
  wakeHour,
  sleepHour,
  onChange,
}: {
  wakeHour: number | undefined;
  sleepHour: number | undefined;
  onChange: (next: { wakeHour?: number; sleepHour?: number }) => void;
}) {
  return (
    <div className="space-y-4">
      <HourSelect label="Jam bangun" hours={WAKE_HOURS} value={wakeHour} onChange={({ hour }) => onChange({ wakeHour: hour, sleepHour })} />
      <HourSelect label="Jam tidur" hours={SLEEP_HOURS} value={sleepHour} onChange={({ hour }) => onChange({ wakeHour, sleepHour: hour })} />
    </div>
  );
}

type MealKey = keyof typeof MEALS;

/** F2–F4: jam makan (atau "tidak …"), lalu makanan & minuman beserta porsinya. */
export function MealFields({
  meal,
  value,
  onChange,
}: {
  meal: MealKey;
  value: MealAnswer | undefined;
  onChange: (next: MealAnswer) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-brown-700">
        <input
          type="checkbox"
          checked={current.none ?? false}
          onChange={(e) => onChange(e.target.checked ? { none: true } : {})}
        />
        {MEAL_NONE[meal]}
      </label>
      {!current.none && (
        <>
          <HourSelect
            label={`Jam ${MEALS[meal].toLowerCase()}`}
            hours={MEAL_HOURS[meal]}
            value={current.hour}
            onChange={({ hour }) => onChange({ ...current, hour })}
          />
          <TextAnswer
            label="Apa yang Anda makan & minum, berapa porsinya?"
            rows={3}
            maxLength={TEXT_LIMITS.long}
            placeholder="Nasi 1 piring, telur dadar 1, teh manis 1 gelas"
            value={current.text}
            onChange={(text) => onChange({ ...current, text })}
          />
        </>
      )}
    </div>
  );
}

/** F5: seberapa sering, jam biasanya (atau "Tidak tentu"), lalu jenis & jumlahnya. */
export function SnackFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HabitAnswers["snack"];
  onChange: (next: NonNullable<HabitAnswers["snack"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-4">
      <SingleChoice
        label={label}
        options={optionsOf(SNACK_FREQUENCIES)}
        value={current.frequency}
        onChange={(frequency) => onChange({ ...current, frequency })}
      />
      {current.frequency && current.frequency !== "JARANG" && (
        <>
          <HourSelect
            label="Jam cemilan"
            hours={SNACK_HOURS}
            value={current.hour}
            anytime={current.anytime ?? false}
            anytimeLabel="Tidak tentu"
            onChange={(next) => onChange({ frequency: current.frequency, text: current.text, ...next })}
          />
          <TextAnswer
            label="Cemilan apa, berapa banyak?"
            rows={3}
            maxLength={TEXT_LIMITS.long}
            placeholder="Pisang goreng 2 potong, kerupuk 1 bungkus"
            value={current.text}
            onChange={(text) => onChange({ ...current, text })}
          />
        </>
      )}
    </div>
  );
}

const PER_WEEK = ["1", "2", "3", "4", "5", "6", "7"] as const;

/** F6: rutin atau tidak; bila berolahraga: jenis, menit, kali seminggu, dan jam biasanya. */
export function ExerciseFields({
  label,
  value,
  onChange,
}: {
  label: string;
  value: HabitAnswers["exercise"];
  onChange: (next: NonNullable<HabitAnswers["exercise"]>) => void;
}) {
  const current = value ?? {};
  return (
    <div className="space-y-4">
      <SingleChoice
        label={label}
        options={optionsOf(EXERCISE_ROUTINES)}
        value={current.routine}
        onChange={(routine) => onChange(routine === "TIDAK" ? { routine } : { ...current, routine })}
      />
      {current.routine && current.routine !== "TIDAK" && (
        <>
          <ShortText
            label="Jenis olahraga"
            maxLength={TEXT_LIMITS.short}
            placeholder="Jalan kaki, gym, renang, senam"
            value={current.kind}
            onChange={(kind) => onChange({ ...current, kind })}
          />
          <NumberInput
            label="Berapa menit sekali olahraga"
            unit="menit"
            min={MEASURE_LIMITS.exerciseMinutes.min}
            max={MEASURE_LIMITS.exerciseMinutes.max}
            value={current.minutes}
            onChange={(minutes) => onChange({ ...current, minutes: minutes === undefined ? undefined : Math.round(minutes) })}
          />
          <div className="space-y-1">
            <p className="text-sm text-brown-700">Berapa kali seminggu?</p>
            <Segmented
              label="Berapa kali seminggu"
              options={PER_WEEK.map((n) => ({ value: n, label: `${n}×` }))}
              value={current.perWeek === undefined ? undefined : (String(current.perWeek) as (typeof PER_WEEK)[number])}
              onChange={(n) => onChange({ ...current, perWeek: Number(n) })}
            />
          </div>
          <HourSelect
            label="Jam olahraga"
            hours={EXERCISE_HOURS}
            value={current.hour}
            onChange={({ hour }) => onChange({ ...current, hour })}
          />
        </>
      )}
    </div>
  );
}

type HabitLevels = Pick<HabitAnswers, "smoking" | "alcohol" | "soda">;

/** F7: merokok, minum alkohol, dan minuman bersoda — masing-masing Tidak / Kadang / Sering. */
export function HabitLevelFields({ value, onChange }: { value: HabitLevels; onChange: (next: HabitLevels) => void }) {
  return (
    <div className="space-y-4">
      {(Object.keys(HABITS) as (keyof typeof HABITS)[]).map((key) => (
        <fieldset key={key} className="space-y-2">
          <legend className="text-sm font-semibold text-brown-900">{HABITS[key]}</legend>
          <Segmented
            label={HABITS[key]}
            options={optionsOf(HABIT_LEVELS)}
            value={value[key]}
            onChange={(level) => onChange({ ...value, [key]: level })}
          />
        </fieldset>
      ))}
    </div>
  );
}
