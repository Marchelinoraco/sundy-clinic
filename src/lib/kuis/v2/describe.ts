import { minutesToTimeLabel } from "@/lib/time";
import type { HabitAnswers, QuizAnswers } from "./answers";
import {
  BODY_AREAS,
  COMPLAINT_DURATIONS,
  DIET_HISTORY,
  EXERCISE_ROUTINES,
  HABIT_LEVELS,
  MEALS,
  PREGNANCY,
  PRIOR_TREATMENTS,
  PURPOSES,
  SKIN_COMPLAINTS,
  SKIN_TYPES,
  SLIMMING_GOALS,
  SNACK_FREQUENCIES,
  WEIGHT_AFTER_DIET,
  WEIGHT_TARGETS,
} from "./options";
import { conditionName, dietProgramName, selectedConditions, type StepId } from "./steps";

export type IntakeSection = { title: string; step: StepId; lines: string[] };

/** Pembaca ringkasan: customer (layar Ringkasan) atau staf (halaman isian). */
export type Audience = "customer" | "staff";

const decimal = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 });

/** 28.8 → "28,8" — tanda desimal Indonesia. */
export function formatDecimal(value: number): string {
  return decimal.format(value);
}

export function bodyMassIndex(weightKg: number, heightCm: number): number {
  const meters = heightCm / 100;
  return Math.round((weightKg / (meters * meters)) * 10) / 10;
}

const hourLabel = (hour: number) => minutesToTimeLabel(hour * 60);

function labels<T extends Record<string, string>>(map: T, keys: readonly (keyof T)[] | undefined): string {
  return (keys ?? []).map((key) => map[key]).join(", ");
}

const present = (line: string | null | undefined | false | 0): line is string => Boolean(line);

type MealKey = keyof typeof MEALS;
type Exercise = NonNullable<HabitAnswers["exercise"]>;

function exerciseText(e: Exercise): string {
  return `${e.kind ?? "-"}, ${e.minutes ?? "-"} menit, ${e.perWeek ?? "-"}× seminggu`;
}

function levelsLine(h: HabitAnswers): string | null {
  if (!h.smoking || !h.alcohol || !h.soda) return null;
  return `Rokok: ${HABIT_LEVELS[h.smoking]} · Alkohol: ${HABIT_LEVELS[h.alcohol]} · Soda: ${HABIT_LEVELS[h.soda]}`;
}

function mealLine(key: MealKey, h: HabitAnswers): string | null {
  const meal = h[key];
  if (!meal) return null;
  if (meal.none) return `Tidak ${MEALS[key].toLowerCase()}`;
  return meal.hour === undefined ? null : `${hourLabel(meal.hour)}: ${meal.text ?? "-"}`;
}

function snackLine(h: HabitAnswers): string | null {
  const snack = h.snack;
  if (!snack?.frequency) return null;
  if (snack.frequency === "JARANG") return SNACK_FREQUENCIES.JARANG;
  const when = snack.anytime || snack.hour === undefined ? "jam tidak tentu" : hourLabel(snack.hour);
  return `${SNACK_FREQUENCIES[snack.frequency]}, ${when}: ${snack.text ?? "-"}`;
}

function exerciseLine(h: HabitAnswers): string | null {
  const exercise = h.exercise;
  if (!exercise?.routine) return null;
  if (exercise.routine === "TIDAK") return EXERCISE_ROUTINES.TIDAK;
  const when = exercise.hour === undefined ? "" : `, jam ${hourLabel(exercise.hour)}`;
  return `${EXERCISE_ROUTINES[exercise.routine]}: ${exerciseText(exercise)}${when}`;
}

/** Form recall untuk layar Ringkasan customer; staf melihatnya sebagai tabel (habitTable). */
function formRecallSections(h: HabitAnswers): IntakeSection[] {
  const sleep =
    h.wakeHour !== undefined && h.sleepHour !== undefined
      ? `Bangun ${hourLabel(h.wakeHour)} · tidur ${hourLabel(h.sleepHour)}`
      : null;
  return [
    { title: "Jam bangun & tidur", step: "F1", lines: [sleep].filter(present) },
    { title: "Sarapan", step: "F2", lines: [mealLine("breakfast", h)].filter(present) },
    { title: "Makan siang", step: "F3", lines: [mealLine("lunch", h)].filter(present) },
    { title: "Makan malam", step: "F4", lines: [mealLine("dinner", h)].filter(present) },
    { title: "Cemilan", step: "F5", lines: [snackLine(h)].filter(present) },
    { title: "Olahraga", step: "F6", lines: [exerciseLine(h)].filter(present) },
    { title: "Rokok, alkohol, soda", step: "F7", lines: [levelsLine(h)].filter(present) },
  ];
}

/**
 * Jawaban per bagian dalam kalimat. Customer membacanya di layar Ringkasan
 * (dengan tombol "Ubah" ke `step`), staf di halaman isian (spec kuis v2, 5–6).
 */
export function describeAnswers(a: QuizAnswers, audience: Audience): IntakeSection[] {
  const sections: IntakeSection[] = [];
  if (!a.purpose || !a.patientType) return sections;

  const returning = a.patientType === "LAMA";
  const who =
    audience === "staff"
      ? returning
        ? "pasien lama"
        : "pasien baru"
      : returning
        ? "pernah ke SunDY"
        : "pertama kali ke SunDY";
  sections.push({ title: "Tujuan konsultasi", step: "U2", lines: [`${PURPOSES[a.purpose]} · ${who}`] });

  const s = a.slimming;
  if (s) {
    sections.push({
      title: "Tujuan & target",
      step: "S1",
      lines: [
        s.goal && `Tujuan utama: ${SLIMMING_GOALS[s.goal]}`,
        s.weightTarget && `Target turun: ${WEIGHT_TARGETS[s.weightTarget]}`,
        s.areas?.length && `Area: ${labels(BODY_AREAS, s.areas)}`,
      ].filter(present),
    });

    const dietLines: string[] = s.dietHistory ? [DIET_HISTORY[s.dietHistory]] : [];
    for (const program of s.dietPrograms ?? []) {
      const result = s.dietResults?.[program];
      const name = dietProgramName(a, program);
      if (result?.outcome === "BERHASIL") {
        const lost = result.lostKg !== undefined ? ` −${formatDecimal(result.lostKg)} kg` : "";
        const after = result.weightAfter ? `, ${WEIGHT_AFTER_DIET[result.weightAfter].toLowerCase()}` : "";
        dietLines.push(`${name}: berhasil${lost}${after}`);
      } else if (result?.outcome === "MASIH_JALAN") {
        const lost = result.lostKg !== undefined ? ` −${formatDecimal(result.lostKg)} kg` : "";
        dietLines.push(`${name}: masih jalan${lost}`);
      } else if (result?.outcome === "TIDAK_BERHASIL") {
        dietLines.push(`${name}: tidak berhasil`);
      }
    }
    sections.push({ title: "Riwayat diet", step: "S4", lines: dietLines });
  }

  if (a.nutrition?.story) {
    sections.push({ title: "Keluhan atau tujuan", step: "N1", lines: [a.nutrition.story] });
  }

  const body = a.body;
  if (body?.weightKg !== undefined && body.heightCm !== undefined) {
    sections.push({
      title: "Berat & tinggi (ukuran mandiri)",
      step: "T1",
      lines: [
        `${formatDecimal(body.weightKg)} kg · ${formatDecimal(body.heightCm)} cm · IMT ${formatDecimal(bodyMassIndex(body.weightKg, body.heightCm))}`,
      ],
    });
  }

  if (a.habits && audience === "customer") sections.push(...formRecallSections(a.habits));

  const ae = a.aesthetic;
  if (ae) {
    const complaints = (ae.complaints ?? []).map((c) =>
      c === "LAINNYA" && ae.complaintOther ? ae.complaintOther : SKIN_COMPLAINTS[c],
    );
    sections.push({
      title: "Keluhan kulit",
      step: "A1",
      lines: [
        `Keluhan: ${complaints.join(", ")}`,
        ae.skinType && `Jenis kulit: ${SKIN_TYPES[ae.skinType]}`,
        ae.duration && `Lama keluhan: ${COMPLAINT_DURATIONS[ae.duration]}`,
      ].filter(present),
    });
    const treatments = (ae.priorTreatments ?? []).map((t) =>
      t === "LAINNYA" && ae.priorTreatmentOther ? ae.priorTreatmentOther : PRIOR_TREATMENTS[t],
    );
    sections.push({
      title: "Perawatan sebelumnya",
      step: "A4",
      lines: [`Treatment: ${treatments.join(", ")}`, ae.skincare && `Skincare: ${ae.skincare}`].filter(present),
    });
  }

  const r = a.returning;
  if (r) {
    sections.push({
      title: "Kunjungan ini",
      step: "P1",
      lines: [
        r.story ?? "",
        r.healthChanged ? "Ada perubahan penyakit atau obat" : "Tidak ada perubahan penyakit atau obat",
      ].filter(Boolean),
    });
  }

  const h = a.health;
  if (h) {
    const conditions = selectedConditions(a);
    const lines =
      conditions.length === 0
        ? ["Riwayat penyakit: tidak ada"]
        : conditions.map((condition) => {
            const medication = h.medications?.[condition];
            return `${conditionName(a, condition)}: ${medication?.none ? "tidak minum obat" : medication?.text ?? "-"}`;
          });
    lines.push(`Obat/suplemen lain: ${h.otherMeds?.has ? (h.otherMeds.text || "belum diisi") : "tidak ada"}`);
    lines.push(`Alergi: ${h.allergies?.has ? (h.allergies.text || "belum diisi") : "tidak ada"}`);
    if (h.pregnancy) lines.push(`Hamil/menyusui: ${PREGNANCY[h.pregnancy]}`);
    sections.push({ title: "Kesehatan", step: "K1", lines });
  }

  return sections;
}

export type HabitRow = { hour: number; label: string; entries: string[] };
export type HabitTable = { rows: HabitRow[]; notes: string[] };

const FIRST_HOUR = 6;
const LAST_HOUR = 22;

/** 00.00–02.00 ditaruh setelah 23.00: jam tidur lewat tengah malam (spec kuis v2, bagian 6). */
const dayOrder = (hour: number) => (hour <= 2 ? hour + 24 : hour);

/**
 * Form recall sebagai tabel per jam, seperti lembar kertas klinik "JAM | Jenis
 * dan Jumlah Pemberian". Baris 06.00–22.00 selalu ada dan melebar bila ada
 * catatan di luarnya; yang tidak berjam tampil di `notes`.
 */
export function habitTable(h: HabitAnswers): HabitTable {
  const timed: { hour: number; rank: number; text: string }[] = [];
  const notes: string[] = [];

  if (h.wakeHour !== undefined) timed.push({ hour: h.wakeHour, rank: 0, text: "Bangun tidur" });
  for (const key of ["breakfast", "lunch", "dinner"] as const) {
    const meal = h[key];
    if (meal?.none) notes.push(`Tidak ${MEALS[key].toLowerCase()}`);
    else if (meal?.hour !== undefined) timed.push({ hour: meal.hour, rank: 1, text: `${MEALS[key]}: ${meal.text ?? "-"}` });
  }

  const snack = h.snack;
  if (snack?.frequency === "JARANG") {
    notes.push("Cemilan: jarang atau tidak pernah");
  } else if (snack?.frequency) {
    const text = `Cemilan (${SNACK_FREQUENCIES[snack.frequency].toLowerCase()}): ${snack.text ?? "-"}`;
    if (snack.anytime || snack.hour === undefined) notes.push(`${text} — jam tidak tentu`);
    else timed.push({ hour: snack.hour, rank: 2, text });
  }

  const exercise = h.exercise;
  if (exercise?.routine === "TIDAK") notes.push("Tidak berolahraga");
  else if (exercise?.routine && exercise.hour !== undefined) {
    timed.push({ hour: exercise.hour, rank: 3, text: `Olahraga: ${exerciseText(exercise)}` });
  }

  if (h.sleepHour !== undefined) timed.push({ hour: h.sleepHour, rank: 4, text: "Tidur malam" });

  const levels = levelsLine(h);
  if (levels) notes.push(levels);

  const orders = timed.map((entry) => dayOrder(entry.hour));
  const first = Math.min(FIRST_HOUR, ...orders);
  const last = Math.max(LAST_HOUR, ...orders);
  const rows: HabitRow[] = [];
  for (let order = first; order <= last; order++) {
    const hour = order % 24;
    rows.push({
      hour,
      label: hourLabel(hour),
      entries: timed
        .filter((entry) => dayOrder(entry.hour) === order)
        .sort((x, y) => x.rank - y.rank)
        .map((entry) => entry.text),
    });
  }
  return { rows, notes };
}
