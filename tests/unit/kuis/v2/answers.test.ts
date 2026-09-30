import { describe, expect, it } from "vitest";
import { quizAnswersSchema } from "@/lib/kuis/v2/answers";
import { MEAL_HOURS, PURPOSES, QUIZ_VERSION, SLEEP_HOURS } from "@/lib/kuis/v2/options";
import * as v1 from "../../../fixtures/quiz-answers";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  nutritionNewPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
} from "../../../fixtures/quiz-answers-v2";

describe("kuis v2: pilihan", () => {
  it("versi 2 dengan tiga tujuan, tanpa 'Belum yakin'", () => {
    expect(QUIZ_VERSION).toBe(2);
    expect(PURPOSES).toEqual({
      SLIMMING: "Slimming",
      AESTHETIC: "Aesthetic",
      GIZI_KLINIK: "Konsultasi dokter spesialis gizi klinik",
    });
  });

  it("jam tidur boleh lewat tengah malam sampai 02.00, makan malam 16.00–23.00", () => {
    expect(SLEEP_HOURS).toEqual([18, 19, 20, 21, 22, 23, 0, 1, 2]);
    expect(MEAL_HOURS.dinner).toEqual([16, 17, 18, 19, 20, 21, 22, 23]);
  });
});

describe("kuis v2: skema jawaban", () => {
  it.each([
    ["Slimming baru", slimmingNewPatient],
    ["gizi klinik baru", nutritionNewPatient],
    ["Aesthetic baru", aestheticNewPatient],
    ["Slimming lama", slimmingReturningPatient],
    ["Aesthetic lama", aestheticReturningPatient],
  ])("menerima jawaban %s", (_, answers) => {
    expect(quizAnswersSchema.safeParse(answers).success).toBe(true);
  });

  it("menolak bagian khas versi 1 (tab lama yang terbuka saat rilis)", () => {
    expect(quizAnswersSchema.safeParse(v1.slimmingNewPatient).success).toBe(false);
    expect(quizAnswersSchema.safeParse(v1.unsureNewPatient).success).toBe(false);
    expect(quizAnswersSchema.safeParse(v1.slimmingReturningPatient).success).toBe(false);
  });

  it("menolak jam di luar 0–23 dan menit olahraga pecahan", () => {
    expect(quizAnswersSchema.safeParse({ habits: { wakeHour: 24 } }).success).toBe(false);
    expect(quizAnswersSchema.safeParse({ habits: { exercise: { minutes: 30.5 } } }).success).toBe(false);
  });
});
