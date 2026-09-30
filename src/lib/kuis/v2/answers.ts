import { z } from "zod";
import {
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  CONDITIONS,
  DIET_HISTORY,
  DIET_OUTCOMES,
  DIET_PROGRAMS,
  EXERCISE_ROUTINES,
  HABIT_LEVELS,
  MEASURE_LIMITS,
  PATIENT_TYPES,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
  SNACK_FREQUENCIES,
  TEXT_LIMITS,
  WEIGHT_AFTER_DIET,
  WEIGHT_TARGETS,
} from "./options";

/** z.enum dari kunci objek label, mis. { PERUT: "Perut" } menerima "PERUT". */
function keysOf<T extends Record<string, string>>(labels: T) {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

function choices<T extends z.ZodType<string>>(item: T) {
  return z.array(item).refine((values) => new Set(values).size === values.length, "Pilihan ganda.");
}

const text = (max: number) => z.string().trim().max(max);

const between = (limits: { min: number; max: number }) => z.number().min(limits.min).max(limits.max);

const wholeBetween = (limits: { min: number; max: number }) => z.number().int().min(limits.min).max(limits.max);

/** Jam 0–23; daftar jam yang boleh dipilih per pertanyaan diperiksa di steps.ts. */
const hour = z.number().int().min(0).max(23);

const dietResult = z.strictObject({
  outcome: keysOf(DIET_OUTCOMES).optional(),
  lostKg: between(MEASURE_LIMITS.lostKg).optional(),
  weightAfter: keysOf(WEIGHT_AFTER_DIET).optional(),
});

const medication = z.strictObject({
  text: text(TEXT_LIMITS.medication).optional(),
  none: z.boolean().optional(),
});

const yesNoText = z.strictObject({
  has: z.boolean().optional(),
  text: text(TEXT_LIMITS.long).optional(),
});

const meal = z.strictObject({
  none: z.literal(true).optional(),
  hour: hour.optional(),
  text: text(TEXT_LIMITS.long).optional(),
});

/**
 * Bentuk jawaban kuis v2. Semua bagian opsional karena draf diisi bertahap;
 * aturan wajib isi per layar ada di steps.ts. strictObject menolak kunci yang
 * tidak dikenal — termasuk bagian khas versi 1 (unsure, slimming.foodRecall,
 * returning.activities) dari tab yang terbuka sebelum rilis.
 */
export const quizAnswersSchema = z.strictObject({
  patientType: keysOf(PATIENT_TYPES).optional(),
  purpose: keysOf(PURPOSES).optional(),
  slimming: z
    .strictObject({
      goal: keysOf(SLIMMING_GOALS).optional(),
      weightTarget: keysOf(WEIGHT_TARGETS).optional(),
      areas: choices(keysOf(BODY_AREAS)).optional(),
      dietHistory: keysOf(DIET_HISTORY).optional(),
      dietPrograms: choices(keysOf(DIET_PROGRAMS)).optional(),
      dietProgramOther: text(TEXT_LIMITS.short).optional(),
      dietResults: z.partialRecord(keysOf(DIET_PROGRAMS), dietResult).optional(),
    })
    .optional(),
  nutrition: z.strictObject({ story: text(TEXT_LIMITS.story).optional() }).optional(),
  body: z
    .strictObject({
      weightKg: between(MEASURE_LIMITS.weightKg).optional(),
      heightCm: between(MEASURE_LIMITS.heightCm).optional(),
    })
    .optional(),
  habits: z
    .strictObject({
      wakeHour: hour.optional(),
      sleepHour: hour.optional(),
      breakfast: meal.optional(),
      lunch: meal.optional(),
      dinner: meal.optional(),
      snack: z
        .strictObject({
          frequency: keysOf(SNACK_FREQUENCIES).optional(),
          hour: hour.optional(),
          anytime: z.literal(true).optional(),
          text: text(TEXT_LIMITS.long).optional(),
        })
        .optional(),
      exercise: z
        .strictObject({
          routine: keysOf(EXERCISE_ROUTINES).optional(),
          kind: text(TEXT_LIMITS.short).optional(),
          minutes: wholeBetween(MEASURE_LIMITS.exerciseMinutes).optional(),
          perWeek: wholeBetween(MEASURE_LIMITS.exercisePerWeek).optional(),
          hour: hour.optional(),
        })
        .optional(),
      smoking: keysOf(HABIT_LEVELS).optional(),
      alcohol: keysOf(HABIT_LEVELS).optional(),
      soda: keysOf(HABIT_LEVELS).optional(),
    })
    .optional(),
  aesthetic: z
    .strictObject({
      complaints: choices(keysOf(SKIN_COMPLAINTS)).optional(),
      complaintOther: text(TEXT_LIMITS.short).optional(),
      skinType: keysOf(SKIN_TYPES).optional(),
      duration: keysOf(COMPLAINT_DURATIONS).optional(),
      priorTreatments: choices(keysOf(PRIOR_TREATMENTS)).optional(),
      priorTreatmentOther: text(TEXT_LIMITS.short).optional(),
      skincare: text(TEXT_LIMITS.long).optional(),
    })
    .optional(),
  health: z
    .strictObject({
      conditions: choices(keysOf(CONDITIONS)).optional(),
      conditionOther: text(TEXT_LIMITS.short).optional(),
      medications: z.partialRecord(keysOf(CONDITIONS), medication).optional(),
      otherMeds: yesNoText.optional(),
      allergies: yesNoText.optional(),
      pregnancy: keysOf(PREGNANCY).optional(),
    })
    .optional(),
  returning: z
    .strictObject({
      story: text(TEXT_LIMITS.story).optional(),
      healthChanged: z.boolean().optional(),
    })
    .optional(),
});

export type QuizAnswers = z.infer<typeof quizAnswersSchema>;
export type SlimmingAnswers = NonNullable<QuizAnswers["slimming"]>;
export type AestheticAnswers = NonNullable<QuizAnswers["aesthetic"]>;
export type HealthAnswers = NonNullable<QuizAnswers["health"]>;
export type ReturningAnswers = NonNullable<QuizAnswers["returning"]>;
export type HabitAnswers = NonNullable<QuizAnswers["habits"]>;
export type MealAnswer = NonNullable<HabitAnswers["breakfast"]>;
