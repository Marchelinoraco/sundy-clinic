import { describe, expect, it } from "vitest";
import { quizAnswersSchema } from "@/lib/kuis/v1/answers";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
  unsureNewPatient,
} from "../../fixtures/quiz-answers";

describe("quizAnswersSchema", () => {
  it.each([
    ["Slimming baru", slimmingNewPatient],
    ["Aesthetic baru", aestheticNewPatient],
    ["Belum yakin baru", unsureNewPatient],
    ["Slimming lama", slimmingReturningPatient],
    ["Aesthetic lama", aestheticReturningPatient],
  ])("menerima jawaban lengkap %s", (_, answers) => {
    expect(quizAnswersSchema.safeParse(answers).success).toBe(true);
  });

  it("menerima draf kosong, karena setiap bagian diisi bertahap", () => {
    expect(quizAnswersSchema.safeParse({}).success).toBe(true);
  });

  it("menolak kunci yang tidak dikenal", () => {
    expect(quizAnswersSchema.safeParse({ ...slimmingNewPatient, extra: 1 }).success).toBe(false);
    expect(
      quizAnswersSchema.safeParse({ slimming: { goal: "TURUN_BERAT", catatan: "x" } }).success,
    ).toBe(false);
  });

  it("menolak pilihan di luar daftar dan pilihan ganda", () => {
    expect(quizAnswersSchema.safeParse({ purpose: "GIGI" }).success).toBe(false);
    expect(quizAnswersSchema.safeParse({ slimming: { areas: ["PERUT", "PERUT"] } }).success).toBe(false);
  });

  it("menolak berat, tinggi, dan jam aktivitas di luar batas", () => {
    expect(quizAnswersSchema.safeParse({ slimming: { weightKg: 20 } }).success).toBe(false);
    expect(quizAnswersSchema.safeParse({ slimming: { heightCm: 260 } }).success).toBe(false);
    expect(
      quizAnswersSchema.safeParse({ returning: { activities: [{ hour: 23, kind: "OLAHRAGA", text: "Lari" }] } })
        .success,
    ).toBe(false);
  });

  it("menolak teks yang melewati batas panjang dan merapikan spasi", () => {
    expect(quizAnswersSchema.safeParse({ unsure: { story: "a".repeat(1001) } }).success).toBe(false);
    const parsed = quizAnswersSchema.parse({ unsure: { story: "  sakit kepala  " } });
    expect(parsed.unsure?.story).toBe("sakit kepala");
  });
});
