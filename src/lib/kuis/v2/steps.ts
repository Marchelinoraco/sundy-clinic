import {
  quizAnswersSchema,
  type HabitAnswers,
  type HealthAnswers,
  type MealAnswer,
  type QuizAnswers,
  type SlimmingAnswers,
} from "./answers";
import {
  CONDITIONS,
  DIET_PROGRAMS,
  EXCLUSIVE,
  EXERCISE_HOURS,
  MEAL_HOURS,
  MEAL_NONE,
  SLEEP_HOURS,
  SNACK_HOURS,
  WAKE_HOURS,
} from "./options";

export const STEP_IDS = [
  "U1", "U2",
  "S1", "S2", "S3", "S4", "S5", "S6",
  "N1",
  "T1",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7",
  "A1", "A2", "A3", "A4",
  "K1", "K2", "K3", "K4",
  "P1", "P2",
] as const;
export type StepId = (typeof STEP_IDS)[number];

/** Situs menanyakan "Pernah konsultasi atau treatment?"; link WA (Plan 3b-2b) sudah tahu jawabannya. */
export type QuizMode = { askPatientType: boolean };

type ConditionKey = keyof typeof CONDITIONS;
type DietProgramKey = keyof typeof DIET_PROGRAMS;
type MealKey = keyof typeof MEAL_HOURS;

const CHOOSE_ONE = "Pilih salah satu.";
const FROM_LIST = "Pilih jam dari daftar.";

/** Form recall (kebiasaan), satu layar per hal (spec kuis v2, bagian 3). */
const FORM_RECALL: StepId[] = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"];

export function selectedConditions(a: QuizAnswers): ConditionKey[] {
  return (a.health?.conditions ?? []).filter((c) => c !== "TIDAK_ADA");
}

function hasDietHistory(a: QuizAnswers): boolean {
  return a.slimming?.dietHistory === "PERNAH" || a.slimming?.dietHistory === "SEDANG";
}

export function conditionName(a: QuizAnswers, key: ConditionKey): string {
  return key === "LAINNYA" ? a.health?.conditionOther?.trim() || CONDITIONS.LAINNYA : CONDITIONS[key];
}

export function dietProgramName(a: QuizAnswers, key: DietProgramKey): string {
  return key === "LAINNYA" ? a.slimming?.dietProgramOther?.trim() || DIET_PROGRAMS.LAINNYA : DIET_PROGRAMS[key];
}

function healthSteps(a: QuizAnswers, includePregnancy: boolean): StepId[] {
  const steps: StepId[] = ["K1"];
  if (selectedConditions(a).length > 0) steps.push("K2");
  steps.push("K3");
  if (includePregnancy) steps.push("K4");
  return steps;
}

/**
 * Layar kuis yang berlaku untuk jawaban saat ini, berurutan (spec kuis v2,
 * bagian 3). Food recall H-1 tidak ada di kuis online (V10).
 */
export function visibleSteps(a: QuizAnswers, mode: QuizMode): StepId[] {
  const steps: StepId[] = mode.askPatientType ? ["U1", "U2"] : ["U2"];
  if (!a.patientType || !a.purpose) return steps;

  if (a.patientType === "LAMA") {
    steps.push("P1", "P2");
    if (a.returning?.healthChanged) steps.push(...healthSteps(a, false));
    return steps;
  }

  if (a.purpose === "SLIMMING") {
    steps.push("S1", "S2", "S3", "S4");
    if (hasDietHistory(a)) steps.push("S5", "S6");
    steps.push("T1", ...FORM_RECALL);
  } else if (a.purpose === "GIZI_KLINIK") {
    steps.push("N1", "T1", ...FORM_RECALL);
  } else {
    steps.push("A1", "A2", "A3", "A4");
  }
  steps.push(...healthSteps(a, true));
  return steps;
}

const filled = (value?: string) => Boolean(value?.trim());

function multiError(values: readonly string[] | undefined, exclusive?: string, exclusiveLabel?: string) {
  if (!values || values.length === 0) return "Pilih minimal satu.";
  if (exclusive && values.includes(exclusive) && values.length > 1) {
    return `“${exclusiveLabel}” tidak bisa digabung dengan pilihan lain.`;
  }
  return null;
}

const MEAL_WORD: Record<MealKey, string> = { breakfast: "sarapan", lunch: "makan siang", dinner: "makan malam" };

function mealError(key: MealKey, meal: MealAnswer | undefined): string | null {
  if (meal?.none) return null;
  if (meal?.hour === undefined) return `Pilih jam ${MEAL_WORD[key]}, atau centang “${MEAL_NONE[key]}”.`;
  if (!MEAL_HOURS[key].includes(meal.hour)) return FROM_LIST;
  return filled(meal.text) ? null : "Tulis makanan & minuman beserta porsinya.";
}

function snackError(snack: HabitAnswers["snack"]): string | null {
  if (!snack?.frequency) return "Pilih seberapa sering Anda makan cemilan.";
  if (snack.frequency === "JARANG") return null;
  if (!snack.anytime) {
    if (snack.hour === undefined) return "Pilih jam biasanya, atau “Tidak tentu”.";
    if (!SNACK_HOURS.includes(snack.hour)) return FROM_LIST;
  }
  return filled(snack.text) ? null : "Tulis cemilan apa dan berapa banyak.";
}

function exerciseError(exercise: HabitAnswers["exercise"]): string | null {
  if (!exercise?.routine) return CHOOSE_ONE;
  if (exercise.routine === "TIDAK") return null;
  if (!filled(exercise.kind)) return "Tulis jenis olahraga.";
  if (exercise.minutes === undefined) return "Isi berapa menit sekali olahraga (5–300).";
  if (exercise.perWeek === undefined) return "Pilih berapa kali seminggu.";
  if (exercise.hour === undefined || !EXERCISE_HOURS.includes(exercise.hour)) return "Pilih jam biasanya berolahraga.";
  return null;
}

/** Pesan untuk customer bila layar ini belum lengkap, atau null bila boleh lanjut. */
export function stepError(step: StepId, a: QuizAnswers): string | null {
  const s = a.slimming;
  const ae = a.aesthetic;
  const h = a.health;
  const r = a.returning;
  const hb = a.habits;

  switch (step) {
    case "U1":
      return a.patientType ? null : CHOOSE_ONE;
    case "U2":
      return a.purpose ? null : CHOOSE_ONE;
    case "S1":
      return s?.goal ? null : CHOOSE_ONE;
    case "S2":
      return s?.weightTarget ? null : CHOOSE_ONE;
    case "S3":
      return multiError(s?.areas, EXCLUSIVE.areas, "Tidak ada area khusus");
    case "S4":
      return s?.dietHistory ? null : CHOOSE_ONE;
    case "S5":
      return (
        multiError(s?.dietPrograms) ??
        (s?.dietPrograms?.includes("LAINNYA") && !filled(s.dietProgramOther)
          ? "Tulis nama program diet lainnya."
          : null)
      );
    case "S6":
      for (const program of s?.dietPrograms ?? []) {
        const result = s?.dietResults?.[program];
        const name = dietProgramName(a, program);
        if (!result?.outcome) return `Pilih hasil untuk ${name}.`;
        const lost = result.outcome === "BERHASIL" || result.outcome === "MASIH_JALAN";
        if (lost && result.lostKg === undefined) return `Isi berapa kg turun untuk ${name}.`;
        if (result.outcome === "BERHASIL" && !result.weightAfter) {
          return `Pilih keadaan berat sekarang untuk ${name}.`;
        }
      }
      return null;
    case "N1":
      return filled(a.nutrition?.story) ? null : "Ceritakan keluhan atau tujuan Anda.";
    case "T1":
      return a.body?.weightKg === undefined || a.body?.heightCm === undefined ? "Isi berat dan tinggi badan." : null;
    case "F1":
      if (hb?.wakeHour === undefined || !WAKE_HOURS.includes(hb.wakeHour)) return "Pilih jam bangun.";
      if (hb.sleepHour === undefined || !SLEEP_HOURS.includes(hb.sleepHour)) return "Pilih jam tidur.";
      return null;
    case "F2":
      return mealError("breakfast", hb?.breakfast);
    case "F3":
      return mealError("lunch", hb?.lunch);
    case "F4":
      return mealError("dinner", hb?.dinner);
    case "F5":
      return snackError(hb?.snack);
    case "F6":
      return exerciseError(hb?.exercise);
    case "F7":
      return hb?.smoking && hb.alcohol && hb.soda ? null : "Jawab ketiga pertanyaan.";
    case "A1":
      return (
        multiError(ae?.complaints) ??
        (ae?.complaints?.includes("LAINNYA") && !filled(ae.complaintOther) ? "Tulis keluhan lainnya." : null)
      );
    case "A2":
      return ae?.skinType ? null : CHOOSE_ONE;
    case "A3":
      return ae?.duration ? null : CHOOSE_ONE;
    case "A4":
      return (
        multiError(ae?.priorTreatments, EXCLUSIVE.priorTreatments, "Belum pernah") ??
        (ae?.priorTreatments?.includes("LAINNYA") && !filled(ae.priorTreatmentOther)
          ? "Tulis treatment lainnya."
          : null)
      );
    case "K1":
      return (
        multiError(h?.conditions, EXCLUSIVE.conditions, "Tidak ada") ??
        (h?.conditions?.includes("LAINNYA") && !filled(h.conditionOther) ? "Tulis nama penyakit lainnya." : null)
      );
    case "K2":
      for (const condition of selectedConditions(a)) {
        const medication = h?.medications?.[condition];
        if (!medication?.none && !filled(medication?.text)) {
          return `Tulis obat untuk ${conditionName(a, condition)}, atau centang “Tidak minum obat”.`;
        }
      }
      return null;
    case "K3":
      if (h?.otherMeds?.has === undefined) return "Jawab pertanyaan obat atau suplemen lain.";
      if (h.otherMeds.has && !filled(h.otherMeds.text)) return "Tulis obat atau suplemen lain yang Anda minum.";
      if (h.allergies?.has === undefined) return "Jawab pertanyaan alergi.";
      if (h.allergies.has && !filled(h.allergies.text)) return "Tulis alergi Anda.";
      return null;
    case "K4":
      return h?.pregnancy ? null : CHOOSE_ONE;
    case "P1":
      return filled(r?.story) ? null : "Ceritakan keluhan atau tujuan kunjungan ini.";
    case "P2":
      return r?.healthChanged === undefined ? CHOOSE_ONE : null;
  }
}

// JSON bolak-balik membuang kunci bernilai undefined, agar jawaban tersimpan
// tidak memuat kunci kosong.
function compact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function pruneSlimming(s: SlimmingAnswers): SlimmingAnswers {
  const programs = s.dietHistory === "PERNAH" || s.dietHistory === "SEDANG" ? s.dietPrograms ?? [] : [];
  const results = Object.fromEntries(
    programs.flatMap((program) => {
      const result = s.dietResults?.[program];
      if (!result) return [];
      const lost = result.outcome === "BERHASIL" || result.outcome === "MASIH_JALAN";
      return [
        [
          program,
          {
            outcome: result.outcome,
            lostKg: lost ? result.lostKg : undefined,
            weightAfter: result.outcome === "BERHASIL" ? result.weightAfter : undefined,
          },
        ],
      ];
    }),
  ) as SlimmingAnswers["dietResults"];

  return {
    goal: s.goal,
    weightTarget: s.weightTarget,
    areas: s.areas,
    dietHistory: s.dietHistory,
    dietPrograms: programs.length > 0 ? programs : undefined,
    dietProgramOther: programs.includes("LAINNYA") ? s.dietProgramOther : undefined,
    dietResults: programs.length > 0 ? results : undefined,
  };
}

function pruneHealth(h: HealthAnswers, includePregnancy: boolean): HealthAnswers {
  const conditions = h.conditions ?? [];
  const withMedication = conditions.filter((c) => c !== "TIDAK_ADA");
  const medications = Object.fromEntries(
    withMedication.flatMap((condition) => {
      const medication = h.medications?.[condition];
      if (!medication) return [];
      return [[condition, medication.none ? { none: true } : { text: medication.text }]];
    }),
  ) as HealthAnswers["medications"];
  const yesNo = (value: HealthAnswers["otherMeds"]) =>
    value && { has: value.has, text: value.has ? value.text : undefined };

  return {
    conditions: h.conditions,
    conditionOther: conditions.includes("LAINNYA") ? h.conditionOther : undefined,
    medications: withMedication.length > 0 ? medications : undefined,
    otherMeds: yesNo(h.otherMeds),
    allergies: yesNo(h.allergies),
    pregnancy: includePregnancy ? h.pregnancy : undefined,
  };
}

function pruneMeal(meal: MealAnswer | undefined): MealAnswer | undefined {
  if (!meal) return undefined;
  return meal.none ? { none: true } : { hour: meal.hour, text: meal.text };
}

function pruneHabits(h: HabitAnswers): HabitAnswers {
  const snack = h.snack;
  const exercise = h.exercise;
  return {
    wakeHour: h.wakeHour,
    sleepHour: h.sleepHour,
    breakfast: pruneMeal(h.breakfast),
    lunch: pruneMeal(h.lunch),
    dinner: pruneMeal(h.dinner),
    snack:
      snack &&
      (snack.frequency === "JARANG"
        ? { frequency: snack.frequency }
        : {
            frequency: snack.frequency,
            anytime: snack.anytime,
            hour: snack.anytime ? undefined : snack.hour,
            text: snack.text,
          }),
    exercise: exercise && (exercise.routine === "TIDAK" ? { routine: exercise.routine } : { ...exercise }),
    smoking: h.smoking,
    alcohol: h.alcohol,
    soda: h.soda,
  };
}

/**
 * Menyisakan hanya jawaban yang berlaku untuk pilihan customer saat ini.
 * Customer yang mengganti tujuan atau membatalkan centang tidak boleh
 * mengirim jawaban lama yang tidak pernah ia lihat lagi.
 */
export function pruneAnswers(a: QuizAnswers): QuizAnswers {
  const out: QuizAnswers = { patientType: a.patientType, purpose: a.purpose };

  if (a.patientType === "LAMA" && a.returning) {
    out.returning = { story: a.returning.story, healthChanged: a.returning.healthChanged };
    if (a.returning.healthChanged && a.health) out.health = pruneHealth(a.health, false);
  }

  if (a.patientType === "BARU") {
    const recall = a.purpose === "SLIMMING" || a.purpose === "GIZI_KLINIK";
    if (a.purpose === "SLIMMING" && a.slimming) out.slimming = pruneSlimming(a.slimming);
    if (a.purpose === "GIZI_KLINIK" && a.nutrition) out.nutrition = a.nutrition;
    if (recall && a.body) out.body = a.body;
    if (recall && a.habits) out.habits = pruneHabits(a.habits);
    if (a.purpose === "AESTHETIC" && a.aesthetic) {
      out.aesthetic = {
        ...a.aesthetic,
        complaintOther: a.aesthetic.complaints?.includes("LAINNYA") ? a.aesthetic.complaintOther : undefined,
        priorTreatmentOther: a.aesthetic.priorTreatments?.includes("LAINNYA")
          ? a.aesthetic.priorTreatmentOther
          : undefined,
      };
    }
    if (a.health) out.health = pruneHealth(a.health, true);
  }

  return compact(out);
}

export type QuizValidation =
  | { ok: true; answers: QuizAnswers }
  | { ok: false; step: StepId | null; message: string };

/**
 * Pemeriksaan akhir di server: bentuk (zod) lalu aturan setiap layar yang
 * berlaku. Mengembalikan jawaban yang sudah dibersihkan — hanya itu yang
 * boleh disimpan.
 */
export function validateQuizAnswers(raw: unknown, mode: QuizMode): QuizValidation {
  const parsed = quizAnswersSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, step: null, message: "Jawaban tidak sah. Muat ulang halaman lalu coba lagi." };
  }
  const answers = pruneAnswers(parsed.data);
  for (const step of visibleSteps(answers, mode)) {
    const message = stepError(step, answers);
    if (message) return { ok: false, step, message };
  }
  return { ok: true, answers };
}
