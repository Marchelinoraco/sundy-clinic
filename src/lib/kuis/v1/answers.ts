import { z } from "zod";
import {
  ACTIVITY_FIRST_HOUR,
  ACTIVITY_KINDS,
  ACTIVITY_LAST_HOUR,
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  CONDITIONS,
  DIET_HISTORY,
  DIET_OUTCOMES,
  DIET_PROGRAMS,
  MEALS,
  MEASURE_LIMITS,
  PATIENT_TYPES,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
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

export const activityEntrySchema = z.strictObject({
  hour: z.number().int().min(ACTIVITY_FIRST_HOUR).max(ACTIVITY_LAST_HOUR),
  kind: keysOf(ACTIVITY_KINDS),
  text: text(TEXT_LIMITS.activity).min(1),
});

/**
 * Bentuk jawaban kuis v1. Semua bagian opsional karena draf diisi bertahap;
 * aturan wajib isi per layar ada di steps.ts (stepError), dan
 * validateQuizAnswers menggabungkan keduanya. strictObject menolak kunci
 * yang tidak dikenal — data asing tidak pernah masuk ke rekam medis.
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
      weightKg: between(MEASURE_LIMITS.weightKg).optional(),
      heightCm: between(MEASURE_LIMITS.heightCm).optional(),
      foodRecall: z.partialRecord(keysOf(MEALS), text(TEXT_LIMITS.long)).optional(),
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
  unsure: z.strictObject({ story: text(TEXT_LIMITS.story).optional() }).optional(),
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
      activities: z.array(activityEntrySchema).max(40).optional(),
    })
    .optional(),
});

export type QuizAnswers = z.infer<typeof quizAnswersSchema>;
export type ActivityEntry = z.infer<typeof activityEntrySchema>;
export type SlimmingAnswers = NonNullable<QuizAnswers["slimming"]>;
export type AestheticAnswers = NonNullable<QuizAnswers["aesthetic"]>;
export type HealthAnswers = NonNullable<QuizAnswers["health"]>;
export type ReturningAnswers = NonNullable<QuizAnswers["returning"]>;
