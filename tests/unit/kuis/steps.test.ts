import { describe, expect, it } from "vitest";
import type { QuizAnswers } from "@/lib/kuis/v1/answers";
import { pruneAnswers, stepError, validateQuizAnswers, visibleSteps } from "@/lib/kuis/v1/steps";
import { stepText } from "@/lib/kuis/v1/texts";
import {
  aestheticNewPatient,
  aestheticReturningPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
  unsureNewPatient,
} from "../../fixtures/quiz-answers";

const SITE = { askPatientType: true };
const LINK = { askPatientType: false };

describe("visibleSteps", () => {
  it("berhenti di dua pertanyaan awal sampai tipe pasien dan tujuan dipilih", () => {
    expect(visibleSteps({}, SITE)).toEqual(["U1", "U2"]);
    expect(visibleSteps({ patientType: "BARU" }, SITE)).toEqual(["U1", "U2"]);
  });

  it("tidak menanyakan tipe pasien bila sudah ditentukan sistem (link WA)", () => {
    expect(visibleSteps({}, LINK)).toEqual(["U2"]);
  });

  it("jalur Slimming pasien baru dengan riwayat diet", () => {
    expect(visibleSteps(slimmingNewPatient, SITE)).toEqual([
      "U1", "U2", "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "K1", "K2", "K3", "K4",
    ]);
  });

  it("melewati pertanyaan program diet bila belum pernah diet dan obat bila tidak ada penyakit", () => {
    const answers: QuizAnswers = {
      ...slimmingNewPatient,
      slimming: { ...slimmingNewPatient.slimming, dietHistory: "BELUM" },
      health: { ...slimmingNewPatient.health, conditions: ["TIDAK_ADA"] },
    };
    expect(visibleSteps(answers, SITE)).toEqual(["U1", "U2", "S1", "S2", "S3", "S4", "S7", "S8", "K1", "K3", "K4"]);
  });

  it("jalur Aesthetic dan Belum yakin pasien baru", () => {
    expect(visibleSteps(aestheticNewPatient, SITE)).toEqual(["U1", "U2", "A1", "A2", "A3", "A4", "K1", "K3", "K4"]);
    expect(visibleSteps(unsureNewPatient, SITE)).toEqual(["U1", "U2", "B1", "K1", "K3", "K4"]);
  });

  it("kuis pendek pasien lama: kesehatan hanya bila ada perubahan, aktivitas hanya untuk Slimming", () => {
    expect(visibleSteps(slimmingReturningPatient, SITE)).toEqual(["U1", "U2", "P1", "P2", "K1", "K2", "K3", "P3"]);
    expect(visibleSteps(aestheticReturningPatient, SITE)).toEqual(["U1", "U2", "P1", "P2"]);
  });
});

describe("stepError", () => {
  it("mewajibkan obat atau 'Tidak minum obat' untuk setiap penyakit (K5)", () => {
    const answers: QuizAnswers = {
      health: { conditions: ["DARAH_TINGGI", "DIABETES"], medications: { DARAH_TINGGI: { text: "Amlodipine" } } },
    };
    expect(stepError("K2", answers)).toBe("Tulis obat untuk Diabetes, atau centang “Tidak minum obat”.");
    answers.health!.medications!.DIABETES = { none: true };
    expect(stepError("K2", answers)).toBeNull();
  });

  it("memakai nama penyakit lain yang diketik pasien di pesan", () => {
    const answers: QuizAnswers = { health: { conditions: ["LAINNYA"], conditionOther: "Asma" } };
    expect(stepError("K2", answers)).toBe("Tulis obat untuk Asma, atau centang “Tidak minum obat”.");
  });

  it("mewajibkan hasil setiap program diet, kg bila berhasil/masih jalan, dan berat sekarang bila berhasil (K6)", () => {
    const answers: QuizAnswers = {
      slimming: { dietHistory: "PERNAH", dietPrograms: ["KETO"], dietResults: { KETO: { outcome: "BERHASIL" } } },
    };
    expect(stepError("S6", answers)).toBe("Isi berapa kg turun untuk Keto.");
    answers.slimming!.dietResults!.KETO = { outcome: "BERHASIL", lostKg: 5 };
    expect(stepError("S6", answers)).toBe("Pilih keadaan berat sekarang untuk Keto.");
    answers.slimming!.dietResults!.KETO = { outcome: "MASIH_JALAN", lostKg: 2 };
    expect(stepError("S6", answers)).toBeNull();
  });

  it("menolak pilihan eksklusif yang digabung", () => {
    expect(stepError("K1", { health: { conditions: ["TIDAK_ADA", "DIABETES"] } })).toBe(
      "“Tidak ada” tidak bisa digabung dengan pilihan lain.",
    );
  });

  it("mewajibkan teks untuk pilihan Lainnya", () => {
    expect(stepError("S5", { slimming: { dietPrograms: ["LAINNYA"] } })).toBe("Tulis nama program diet lainnya.");
    expect(stepError("A1", { aesthetic: { complaints: ["LAINNYA"], complaintOther: "  " } })).toBe(
      "Tulis keluhan lainnya.",
    );
  });

  it("food recall cukup satu dari pagi, siang, atau malam", () => {
    expect(stepError("S8", { slimming: { foodRecall: { snack: "Keripik" } } })).toBe(
      "Isi minimal satu: pagi, siang, atau malam.",
    );
    expect(stepError("S8", { slimming: { foodRecall: { malam: "Nasi" } } })).toBeNull();
  });

  it("aktivitas H-1 minimal satu catatan", () => {
    expect(stepError("P3", { returning: { activities: [] } })).toBe("Tambahkan minimal satu catatan.");
  });
});

describe("pruneAnswers", () => {
  it("membuang jawaban jalur lain bila pasien mengganti tujuan (Review Focus 1)", () => {
    const switched = { ...slimmingNewPatient, purpose: "AESTHETIC", aesthetic: aestheticNewPatient.aesthetic } as QuizAnswers;
    const pruned = pruneAnswers(switched);
    expect(pruned.slimming).toBeUndefined();
    expect(pruned.aesthetic).toEqual(aestheticNewPatient.aesthetic);
  });

  it("membuang obat penyakit yang tidak lagi dicentang dan teks milik pilihan yang dibatalkan", () => {
    const answers: QuizAnswers = {
      ...slimmingNewPatient,
      health: {
        ...slimmingNewPatient.health,
        conditions: ["DIABETES"],
        conditionOther: "Asma",
        otherMeds: { has: false, text: "Vitamin D" },
      },
    };
    const pruned = pruneAnswers(answers);
    expect(pruned.health?.medications).toEqual({ DIABETES: { none: true } });
    expect(pruned.health?.conditionOther).toBeUndefined();
    expect(pruned.health?.otherMeds).toEqual({ has: false });
  });

  it("membuang riwayat program diet bila pasien memilih Belum pernah", () => {
    const answers: QuizAnswers = { ...slimmingNewPatient, slimming: { ...slimmingNewPatient.slimming, dietHistory: "BELUM" } };
    const pruned = pruneAnswers(answers);
    expect(pruned.slimming?.dietPrograms).toBeUndefined();
    expect(pruned.slimming?.dietResults).toBeUndefined();
  });

  it("pasien lama: membuang kesehatan bila tidak ada perubahan, dan aktivitas bila bukan Slimming", () => {
    const answers = {
      ...aestheticReturningPatient,
      returning: { ...aestheticReturningPatient.returning, activities: [{ hour: 7, kind: "OLAHRAGA", text: "Lari" }] },
      health: slimmingReturningPatient.health,
    } as QuizAnswers;
    const pruned = pruneAnswers(answers);
    expect(pruned.health).toBeUndefined();
    expect(pruned.returning?.activities).toBeUndefined();
  });
});

describe("validateQuizAnswers", () => {
  it.each([
    ["Slimming baru", slimmingNewPatient],
    ["Aesthetic baru", aestheticNewPatient],
    ["Belum yakin baru", unsureNewPatient],
    ["Slimming lama", slimmingReturningPatient],
    ["Aesthetic lama", aestheticReturningPatient],
  ])("menerima jawaban lengkap %s", (_, answers) => {
    expect(validateQuizAnswers(answers, SITE)).toEqual({ ok: true, answers: pruneAnswers(answers) });
  });

  it("menunjuk langkah pertama yang belum lengkap", () => {
    const answers = { ...slimmingNewPatient, health: { ...slimmingNewPatient.health, pregnancy: undefined } };
    expect(validateQuizAnswers(answers, SITE)).toEqual({ ok: false, step: "K4", message: "Pilih salah satu." });
  });

  it("menolak jawaban yang berhenti sebelum tujuan dipilih", () => {
    expect(validateQuizAnswers({ patientType: "BARU" }, SITE)).toMatchObject({ ok: false, step: "U2" });
  });

  it("menolak bentuk yang tidak sah tanpa membocorkan detail skema", () => {
    expect(validateQuizAnswers({ purpose: "GIGI" }, SITE)).toEqual({
      ok: false,
      step: null,
      message: "Jawaban tidak sah. Muat ulang halaman lalu coba lagi.",
    });
  });
});

describe("stepText", () => {
  it("menyesuaikan pertanyaan pasien lama dengan tujuannya", () => {
    expect(stepText("P1", { purpose: "SLIMMING" }).title).toBe("Bagaimana perkembangan program Anda? Ada keluhan?");
    expect(stepText("P1", { purpose: "AESTHETIC" }).title).toBe("Keluhan atau treatment yang diinginkan kali ini?");
  });
});
