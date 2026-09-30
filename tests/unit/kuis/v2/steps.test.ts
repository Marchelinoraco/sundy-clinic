import { describe, expect, it } from "vitest";
import { pruneAnswers, stepError, validateQuizAnswers, visibleSteps } from "@/lib/kuis/v2/steps";
import * as v1 from "../../../fixtures/quiz-answers";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  nutritionNewPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
} from "../../../fixtures/quiz-answers-v2";

const SITE = { askPatientType: true };
const FORM_RECALL = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"];

describe("visibleSteps v2", () => {
  it("Slimming baru: diet, berat & tinggi, form recall, lalu kesehatan", () => {
    expect(visibleSteps(slimmingNewPatient, SITE)).toEqual([
      "U1", "U2", "S1", "S2", "S3", "S4", "S5", "S6", "T1", ...FORM_RECALL, "K1", "K2", "K3", "K4",
    ]);
  });

  it("gizi klinik baru: keluhan, berat & tinggi, form recall, lalu kesehatan", () => {
    expect(visibleSteps(nutritionNewPatient, SITE)).toEqual([
      "U1", "U2", "N1", "T1", ...FORM_RECALL, "K1", "K2", "K3", "K4",
    ]);
  });

  it("Aesthetic baru tidak memakai form recall", () => {
    expect(visibleSteps(aestheticNewPatient, SITE)).toEqual(["U1", "U2", "A1", "A2", "A3", "A4", "K1", "K3", "K4"]);
  });

  it("customer lama tidak mengisi food recall di kuis online (spec V10)", () => {
    expect(visibleSteps(slimmingReturningPatient, SITE)).toEqual(["U1", "U2", "P1", "P2", "K1", "K2", "K3"]);
    expect(visibleSteps(aestheticReturningPatient, SITE)).toEqual(["U1", "U2", "P1", "P2"]);
    expect(
      visibleSteps({ patientType: "LAMA", purpose: "GIZI_KLINIK", returning: { healthChanged: false } }, SITE),
    ).toEqual(["U1", "U2", "P1", "P2"]);
  });
});

describe("stepError v2", () => {
  it("fixture lengkap lolos di setiap layar alurnya", () => {
    for (const answers of [slimmingNewPatient, nutritionNewPatient, aestheticNewPatient, slimmingReturningPatient]) {
      for (const step of visibleSteps(answers, SITE)) expect(stepError(step, answers)).toBeNull();
    }
  });

  it("N1 dan T1 wajib diisi", () => {
    expect(stepError("N1", {})).toBe("Ceritakan keluhan atau tujuan Anda.");
    expect(stepError("T1", { body: { weightKg: 65 } })).toBe("Isi berat dan tinggi badan.");
  });

  it("F1 butuh jam bangun dan jam tidur dari daftar", () => {
    expect(stepError("F1", {})).toBe("Pilih jam bangun.");
    expect(stepError("F1", { habits: { wakeHour: 6 } })).toBe("Pilih jam tidur.");
    expect(stepError("F1", { habits: { wakeHour: 6, sleepHour: 12 } })).toBe("Pilih jam tidur.");
    expect(stepError("F1", { habits: { wakeHour: 6, sleepHour: 1 } })).toBeNull();
  });

  it("F2 menerima 'tidak sarapan', atau jam dari daftar beserta isinya", () => {
    expect(stepError("F2", {})).toBe("Pilih jam sarapan, atau centang “Saya tidak sarapan”.");
    expect(stepError("F2", { habits: { breakfast: { none: true } } })).toBeNull();
    expect(stepError("F2", { habits: { breakfast: { hour: 13, text: "Roti" } } })).toBe("Pilih jam dari daftar.");
    expect(stepError("F2", { habits: { breakfast: { hour: 7 } } })).toBe("Tulis makanan & minuman beserta porsinya.");
  });

  it("F4 memakai jam makan malam 16.00–23.00", () => {
    expect(stepError("F4", { habits: { dinner: { hour: 15, text: "Nasi" } } })).toBe("Pilih jam dari daftar.");
    expect(stepError("F4", { habits: { dinner: { hour: 23, text: "Nasi" } } })).toBeNull();
  });

  it("F5: 'Jarang' cukup; selain itu jam atau 'Tidak tentu', lalu isinya", () => {
    expect(stepError("F5", {})).toBe("Pilih seberapa sering Anda makan cemilan.");
    expect(stepError("F5", { habits: { snack: { frequency: "JARANG" } } })).toBeNull();
    expect(stepError("F5", { habits: { snack: { frequency: "KADANG" } } })).toBe("Pilih jam biasanya, atau “Tidak tentu”.");
    expect(stepError("F5", { habits: { snack: { frequency: "KADANG", hour: 3, text: "Kerupuk" } } })).toBe(
      "Pilih jam dari daftar.",
    );
    expect(stepError("F5", { habits: { snack: { frequency: "KADANG", anytime: true } } })).toBe(
      "Tulis cemilan apa dan berapa banyak.",
    );
    expect(stepError("F5", { habits: { snack: { frequency: "KADANG", anytime: true, text: "Kerupuk" } } })).toBeNull();
  });

  it("F6: 'Tidak berolahraga' cukup; selain itu jenis, menit, kali seminggu, dan jam", () => {
    const exercise = (e: object) => ({ habits: { exercise: e } });
    expect(stepError("F6", {})).toBe("Pilih salah satu.");
    expect(stepError("F6", exercise({ routine: "TIDAK" }))).toBeNull();
    expect(stepError("F6", exercise({ routine: "RUTIN" }))).toBe("Tulis jenis olahraga.");
    expect(stepError("F6", exercise({ routine: "RUTIN", kind: "Gym" }))).toBe(
      "Isi berapa menit sekali olahraga (5–300).",
    );
    expect(stepError("F6", exercise({ routine: "RUTIN", kind: "Gym", minutes: 60 }))).toBe(
      "Pilih berapa kali seminggu.",
    );
    expect(stepError("F6", exercise({ routine: "RUTIN", kind: "Gym", minutes: 60, perWeek: 3 }))).toBe(
      "Pilih jam biasanya berolahraga.",
    );
    expect(stepError("F6", exercise({ routine: "RUTIN", kind: "Gym", minutes: 60, perWeek: 3, hour: 16 }))).toBeNull();
  });

  it("F7 butuh ketiga jawaban", () => {
    expect(stepError("F7", { habits: { smoking: "TIDAK", alcohol: "TIDAK" } })).toBe("Jawab ketiga pertanyaan.");
  });
});

describe("pruneAnswers v2", () => {
  it("membuang rincian yang tersembunyi: tidak sarapan, cemilan jarang, tidak berolahraga", () => {
    const pruned = pruneAnswers({
      ...slimmingNewPatient,
      habits: {
        ...slimmingNewPatient.habits,
        breakfast: { none: true, hour: 7, text: "Roti" },
        snack: { frequency: "JARANG", hour: 16, text: "Kerupuk" },
        exercise: { routine: "TIDAK", kind: "Gym", minutes: 30 },
      },
    });
    expect(pruned.habits?.breakfast).toEqual({ none: true });
    expect(pruned.habits?.snack).toEqual({ frequency: "JARANG" });
    expect(pruned.habits?.exercise).toEqual({ routine: "TIDAK" });
  });

  it("cemilan 'Tidak tentu' tidak menyimpan jam", () => {
    const pruned = pruneAnswers({
      ...nutritionNewPatient,
      habits: { ...nutritionNewPatient.habits, snack: { frequency: "SERING", anytime: true, hour: 16, text: "Kerupuk" } },
    });
    expect(pruned.habits?.snack).toEqual({ frequency: "SERING", anytime: true, text: "Kerupuk" });
  });

  it("mengganti tujuan membuang jawaban jalur lain, termasuk berat & tinggi dan form recall", () => {
    const switched = pruneAnswers({ ...slimmingNewPatient, purpose: "AESTHETIC", aesthetic: aestheticNewPatient.aesthetic });
    expect(switched).not.toHaveProperty("slimming");
    expect(switched).not.toHaveProperty("body");
    expect(switched).not.toHaveProperty("habits");
  });

  it("customer lama tidak menyimpan form recall", () => {
    const pruned = pruneAnswers({ ...slimmingReturningPatient, habits: nutritionNewPatient.habits });
    expect(pruned).not.toHaveProperty("habits");
  });
});

describe("validateQuizAnswers v2", () => {
  it("menerima jawaban lengkap dan menolak jawaban berbentuk versi 1", () => {
    expect(validateQuizAnswers(nutritionNewPatient, SITE)).toMatchObject({ ok: true });
    expect(validateQuizAnswers(v1.slimmingNewPatient, SITE)).toEqual({
      ok: false,
      step: null,
      message: "Jawaban tidak sah. Muat ulang halaman lalu coba lagi.",
    });
  });
});
