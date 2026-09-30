import { describe, expect, it } from "vitest";
import { clinicalView } from "@/lib/kuis/clinical-view";
import * as v1 from "../../fixtures/quiz-answers";
import * as v2 from "../../fixtures/quiz-answers-v2";

describe("clinicalView", () => {
  it("isian versi 1 lama: bagian lama, tabel aktivitas kemarin, tanpa tabel kebiasaan", () => {
    const view = clinicalView({ quizVersion: 1, answers: v1.slimmingReturningPatient, weightKg: null, heightCm: null });
    expect(view.habits).toBeNull();
    expect(view.activities).toHaveLength(17);
    expect(view.sections.flatMap((section) => section.lines)).toContain("Darah tinggi: Amlodipine 5 mg, 1× sehari");
    expect(view.proposal.medicalHistory).toBe("Darah tinggi: Amlodipine 5 mg, 1× sehari");
  });

  it("isian versi 1 Slimming baru: berat & tinggi dari kolom bertipe", () => {
    const stored = {
      ...v1.slimmingNewPatient,
      slimming: { ...v1.slimmingNewPatient.slimming, weightKg: undefined, heightCm: undefined },
    };
    const view = clinicalView({ quizVersion: 1, answers: stored, weightKg: 72, heightCm: 158 });
    expect(view.sections.flatMap((section) => section.lines)).toContain("72 kg · 158 cm · IMT 28,8");
  });

  it("isian versi 2: bagian untuk staf, tabel kebiasaan, dan usulan dari bagian kesehatan", () => {
    const stored = { ...v2.nutritionNewPatient, body: undefined };
    const view = clinicalView({ quizVersion: 2, answers: stored, weightKg: 65, heightCm: 160 });
    expect(view.activities).toBeNull();
    expect(view.habits?.rows.find((row) => row.label === "07.00")?.entries).toEqual([
      "Sarapan: Nasi kuning 1 piring, teh manis 1 gelas",
    ]);
    expect(view.sections.flatMap((section) => section.lines)).toContain("65 kg · 160 cm · IMT 25,4");
    expect(view.proposal).toEqual({ allergies: "Udang", medicalHistory: "Diabetes: Metformin 500 mg, 2× sehari" });
  });

  it("menolak versi yang tidak dikenal", () => {
    expect(() => clinicalView({ quizVersion: 3, answers: {}, weightKg: null, heightCm: null })).toThrow(
      "Isian dengan kuis versi 3 belum bisa ditampilkan.",
    );
  });

  it("menandai hamil/menyusui hanya bila K4 dijawab Ya, di versi 1 maupun 2", () => {
    const pregnantV2 = { ...v2.slimmingNewPatient, health: { ...v2.slimmingNewPatient.health, pregnancy: "YA" } };
    expect(clinicalView({ quizVersion: 2, answers: pregnantV2, weightKg: null, heightCm: null }).pregnancy).toBe(true);
    expect(clinicalView({ quizVersion: 2, answers: v2.slimmingNewPatient, weightKg: null, heightCm: null }).pregnancy).toBe(false);
    expect(clinicalView({ quizVersion: 1, answers: v1.slimmingReturningPatient, weightKg: null, heightCm: null }).pregnancy).toBe(false);
    const pregnantV1 = { ...v1.slimmingNewPatient, health: { ...v1.slimmingNewPatient.health, pregnancy: "YA" } };
    expect(clinicalView({ quizVersion: 1, answers: pregnantV1, weightKg: null, heightCm: null }).pregnancy).toBe(true);
  });
});
