import { describe, expect, it } from "vitest";
import { proposeRecordFromAnswers } from "@/lib/kuis/v1/record-proposal";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
} from "../../fixtures/quiz-answers";

describe("proposeRecordFromAnswers", () => {
  it("menyusun alergi dan riwayat penyakit beserta obat dari kuis lengkap", () => {
    expect(proposeRecordFromAnswers(slimmingNewPatient)).toEqual({
      allergies: "Amoxicillin (gatal-gatal)",
      medicalHistory:
        "Darah tinggi: Amlodipine 5 mg, 1× sehari\nDiabetes: tidak minum obat\nObat/suplemen lain: Vitamin D, pil KB",
    });
  });

  it("menulis 'Tidak ada' untuk jawaban tidak ada", () => {
    expect(proposeRecordFromAnswers(aestheticNewPatient)).toEqual({
      allergies: "Tidak ada",
      medicalHistory: "Tidak ada riwayat penyakit",
    });
  });

  it("pasien lama dengan perubahan kesehatan hanya mengusulkan yang ia isi", () => {
    expect(proposeRecordFromAnswers(slimmingReturningPatient)).toEqual({
      allergies: "Tidak ada",
      medicalHistory: "Darah tinggi: Amlodipine 5 mg, 1× sehari",
    });
  });

  it("pasien lama tanpa perubahan kesehatan tidak mengusulkan apa pun", () => {
    expect(proposeRecordFromAnswers(aestheticReturningPatient)).toEqual({ allergies: null, medicalHistory: null });
  });

  it("memakai nama penyakit lain yang diketik pasien dan menandai obat yang tidak disebutkan", () => {
    expect(
      proposeRecordFromAnswers({
        patientType: "BARU",
        purpose: "SLIMMING",
        health: {
          conditions: ["LAINNYA", "TIROID"],
          conditionOther: "Asma",
          medications: { LAINNYA: { text: "Salbutamol" } },
          otherMeds: { has: false },
          allergies: { has: true },
        },
      }),
    ).toEqual({
      allergies: "Ada alergi (belum dijelaskan pasien)",
      // Urutan mengikuti pilihan pasien: selectedConditions menyaring a.health.conditions apa adanya.
      medicalHistory: "Asma: Salbutamol\nGangguan tiroid: obat tidak disebutkan",
    });
  });
});
