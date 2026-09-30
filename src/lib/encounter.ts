import { z } from "zod";

/**
 * Aturan isian catatan kunjungan (spec catatan dokter, bagian 5). Formulir di
 * browser memakainya untuk pesan langsung, dan server memeriksa ulang dengan
 * aturan yang sama. Rentang vital juga dijaga CHECK di migrasi kunjungan_dokter.
 */

export const ENCOUNTER_TEXT_MAX = 5000;
export const TREATMENT_TEXT_MAX = { area: 100, dose: 100, notes: 1000 } as const;
export const TREATMENTS_MAX = 20;
export const IMPORTANT_NOTES_MAX = 2000;
export const PAPER_RECORD_NUMBER_MAX = 50;
export const ASSESSMENT_PREVIEW_MAX = 80;

export const FINALIZE_NEEDS_ASSESSMENT = "Isi penilaian (A) sebelum finalisasi.";

export const VITALS = {
  systolic: { label: "Sistolik", unit: "mmHg", min: 50, max: 260, decimals: 0 },
  diastolic: { label: "Diastolik", unit: "mmHg", min: 30, max: 160, decimals: 0 },
  pulse: { label: "Nadi", unit: "/menit", min: 30, max: 220, decimals: 0 },
  temperatureC: { label: "Suhu", unit: "°C", min: 34, max: 42, decimals: 1 },
  weightKg: { label: "Berat badan", unit: "kg", min: 20, max: 300, decimals: 1 },
  heightCm: { label: "Tinggi badan", unit: "cm", min: 100, max: 230, decimals: 1 },
  waistCm: { label: "Lingkar pinggang/perut", unit: "cm", min: 40, max: 200, decimals: 1 },
} as const;

export type VitalKey = keyof typeof VITALS;
export const VITAL_KEYS = Object.keys(VITALS) as VitalKey[];

export const TEXT_FIELDS = {
  subjective: "Keluhan dan anamnesis dokter",
  physicalExam: "Pemeriksaan fisik",
  assessment: "Penilaian / diagnosis",
  plan: "Rencana, program, dan resep",
} as const;

export type TextKey = keyof typeof TEXT_FIELDS;
const TEXT_KEYS = Object.keys(TEXT_FIELDS) as TextKey[];

/** Satu baris treatment apa adanya dari formulir. */
export type TreatmentInput = { serviceId: string; area: string; dose: string; performerId: string; notes: string };

/** Isian formulir apa adanya (teks), seperti yang diketik dokter. */
export type EncounterDraftInput = Record<TextKey, string> & {
  vitals: Record<VitalKey, string>;
  treatments: TreatmentInput[];
};

/** Isian yang sudah diperiksa, siap disimpan. */
export type EncounterDraft = Record<TextKey, string | null> & {
  vitals: Record<VitalKey, number | null>;
  treatments: { serviceId: string; area: string | null; dose: string | null; performerId: string; notes: string | null }[];
};

/** Pilihan treatment dan pelaksana di formulir, dengan usulan baris baru. */
export type EncounterOptions = {
  services: { id: string; name: string }[];
  performers: { id: string; name: string }[];
  defaultServiceId: string;
  defaultPerformerId: string;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

const text = z.string().max(10_000);
const vital = z.string().max(20);

/** Bentuk isian yang boleh dikirim browser; isi dan pesannya diperiksa parseEncounterDraft. */
export const encounterDraftInputSchema = z
  .object({
    subjective: text,
    physicalExam: text,
    assessment: text,
    plan: text,
    vitals: z
      .object({
        systolic: vital,
        diastolic: vital,
        pulse: vital,
        temperatureC: vital,
        weightKg: vital,
        heightCm: vital,
        waistCm: vital,
      })
      .strict(),
    treatments: z
      .array(
        z
          .object({ serviceId: z.string().max(100), area: text, dose: text, performerId: z.string().max(100), notes: text })
          .strict(),
      )
      .max(TREATMENTS_MAX * 2),
  })
  .strict();

const numberFormats = {
  0: new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0, useGrouping: false }),
  1: new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1, useGrouping: false }),
} as const;

/** 72.5 → "72,5"; 160 → "160" — tanda desimal Indonesia. */
export function formatDecimal(value: number, maxFractionDigits: 0 | 1 = 1): string {
  return numberFormats[maxFractionDigits].format(value);
}

function tooLong(label: string, max: number): string {
  return `${label} terlalu panjang (maks. ${new Intl.NumberFormat("id-ID").format(max)} karakter).`;
}

function clean(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Satu angka tanda vital dari teks isian. Koma dan titik sama-sama tanda desimal. */
export function parseVital(key: VitalKey, raw: string): Parsed<number | null> {
  const spec = VITALS[key];
  const value = raw.trim().replace(",", ".");
  if (value === "") return { ok: true, value: null };
  if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false, message: `${spec.label} harus berupa angka.` };
  const fraction = value.split(".")[1] ?? "";
  if (spec.decimals === 0 && fraction.length > 0) return { ok: false, message: `${spec.label} harus bilangan bulat.` };
  if (fraction.length > 1) return { ok: false, message: `${spec.label} paling banyak satu angka di belakang koma.` };
  const number = Number(value);
  if (number < spec.min || number > spec.max) {
    return { ok: false, message: `${spec.label} harus ${spec.min}–${spec.max} ${spec.unit}.` };
  }
  return { ok: true, value: number };
}

/** Tensi selalu berpasangan, dan diastolik lebih kecil dari sistolik (juga CHECK di basis data). */
export function bloodPressureProblem(systolic: number | null, diastolic: number | null): string | null {
  if ((systolic === null) !== (diastolic === null)) return "Isi sistolik dan diastolik bersamaan.";
  if (systolic !== null && diastolic !== null && diastolic >= systolic) return "Diastolik harus lebih kecil dari sistolik.";
  return null;
}

/** Memeriksa seluruh isian. Pesan pertama yang ditemukan dikembalikan apa adanya ke pengguna. */
export function parseEncounterDraft(input: EncounterDraftInput): Parsed<EncounterDraft> {
  const texts = {} as Record<TextKey, string | null>;
  for (const key of TEXT_KEYS) {
    const value = clean(input[key]);
    if (value && value.length > ENCOUNTER_TEXT_MAX) return { ok: false, message: tooLong(TEXT_FIELDS[key], ENCOUNTER_TEXT_MAX) };
    texts[key] = value;
  }

  const vitals = {} as Record<VitalKey, number | null>;
  for (const key of VITAL_KEYS) {
    const parsed = parseVital(key, input.vitals[key]);
    if (!parsed.ok) return parsed;
    vitals[key] = parsed.value;
  }
  const pressure = bloodPressureProblem(vitals.systolic, vitals.diastolic);
  if (pressure) return { ok: false, message: pressure };

  if (input.treatments.length > TREATMENTS_MAX) {
    return { ok: false, message: `Paling banyak ${TREATMENTS_MAX} treatment per kunjungan.` };
  }
  const treatments: EncounterDraft["treatments"] = [];
  for (const row of input.treatments) {
    if (!row.serviceId) return { ok: false, message: "Pilih treatment dari daftar." };
    if (!row.performerId) return { ok: false, message: "Pilih pelaksana treatment." };
    const area = clean(row.area);
    const dose = clean(row.dose);
    const notes = clean(row.notes);
    if (area && area.length > TREATMENT_TEXT_MAX.area) return { ok: false, message: tooLong("Area treatment", TREATMENT_TEXT_MAX.area) };
    if (dose && dose.length > TREATMENT_TEXT_MAX.dose) return { ok: false, message: tooLong("Dosis treatment", TREATMENT_TEXT_MAX.dose) };
    if (notes && notes.length > TREATMENT_TEXT_MAX.notes) {
      return { ok: false, message: tooLong("Catatan pasca-tindakan", TREATMENT_TEXT_MAX.notes) };
    }
    treatments.push({ serviceId: row.serviceId, area, dose, performerId: row.performerId, notes });
  }

  return { ok: true, value: { ...texts, vitals, treatments } };
}

export function emptyDraftInput(): EncounterDraftInput {
  return {
    subjective: "",
    physicalExam: "",
    assessment: "",
    plan: "",
    vitals: { systolic: "", diastolic: "", pulse: "", temperatureC: "", weightKg: "", heightCm: "", waistCm: "" },
    treatments: [],
  };
}

export function bmi(weightKg: number | null, heightCm: number | null): number | null {
  if (weightKg === null || heightCm === null) return null;
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

/** Angka tersimpan → teks isian formulir ("72,5"), atau "" bila tidak diukur. */
export function vitalInputValue(key: VitalKey, value: number | null): string {
  return value === null ? "" : formatDecimal(value, VITALS[key].decimals);
}

/** Baris tanda vital yang diukur, untuk tampilan baca-saja. IMT di akhir. */
export function describeVitals(values: Record<VitalKey, number | null>): string[] {
  const lines: string[] = [];
  if (values.systolic !== null && values.diastolic !== null) {
    lines.push(`Tekanan darah: ${values.systolic}/${values.diastolic} mmHg`);
  }
  for (const key of ["pulse", "temperatureC", "weightKg", "heightCm", "waistCm"] as const) {
    const value = values[key];
    if (value !== null) lines.push(`${VITALS[key].label}: ${vitalInputValue(key, value)} ${VITALS[key].unit}`);
  }
  const index = bmi(values.weightKg, values.heightCm);
  if (index !== null) lines.push(`IMT ${formatDecimal(index)}`);
  return lines;
}

/** Cuplikan penilaian untuk Riwayat kunjungan (spec 4.8). */
export function assessmentPreview(value: string | null, max = ASSESSMENT_PREVIEW_MAX): string | null {
  if (!value) return null;
  const flat = value.replace(/\s+/g, " ").trim();
  if (flat === "") return null;
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

/** Umur dalam tahun pada tanggal WITA "YYYY-MM-DD". `birthDate` adalah kolom @db.Date (dibaca dari UTC). */
export function ageInYears(birthDate: Date, onDate: string): number {
  const [birthYear, birthMonth, birthDay] = birthDate.toISOString().slice(0, 10).split("-").map(Number);
  const [year, month, day] = onDate.split("-").map(Number);
  const beforeBirthday = month < birthMonth || (month === birthMonth && day < birthDay);
  return year - birthYear - (beforeBirthday ? 1 : 0);
}
