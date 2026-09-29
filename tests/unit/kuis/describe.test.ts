import { describe, expect, it } from "vitest";
import { activityTable, bodyMassIndex, describeAnswers } from "@/lib/kuis/v1/describe";
import {
  aestheticNewPatient,
  slimmingNewPatient,
  slimmingReturningPatient,
  unsureNewPatient,
} from "../../fixtures/quiz-answers";

describe("bodyMassIndex", () => {
  it("dibulatkan satu angka di belakang koma", () => {
    expect(bodyMassIndex(72, 158)).toBe(28.8);
  });
});

describe("activityTable", () => {
  it("selalu berisi 17 baris jam 06.00–22.00, dan jam kosong tetap tampil", () => {
    const rows = activityTable(slimmingReturningPatient.returning.activities);
    expect(rows).toHaveLength(17);
    expect(rows[0]).toEqual({ hour: 6, label: "06.00", entries: [{ kindLabel: "Kapsul/obat", text: "Kapsul M" }] });
    expect(rows[2]).toEqual({ hour: 8, label: "08.00", entries: [] });
    expect(rows[6].entries.map((e) => e.text)).toEqual(["Nasi ½, ikan bakar", "Fat Blocker"]);
    expect(rows[16].label).toBe("22.00");
  });
});

describe("describeAnswers", () => {
  it("merangkum pasien baru Slimming seperti yang dibaca dokter", () => {
    const sections = describeAnswers(slimmingNewPatient);
    expect(sections.map((s) => [s.title, s.step])).toEqual([
      ["Tujuan konsultasi", "U2"],
      ["Tujuan & target", "S1"],
      ["Riwayat diet", "S4"],
      ["Berat & tinggi (ukuran mandiri)", "S7"],
      ["Pola makan sehari", "S8"],
      ["Kesehatan", "K1"],
    ]);
    const lines = Object.fromEntries(sections.map((s) => [s.title, s.lines]));
    expect(lines["Tujuan konsultasi"]).toEqual(["Slimming · pasien baru"]);
    expect(lines["Riwayat diet"]).toEqual([
      "Pernah",
      "Kurangi nasi / karbo: berhasil −8 kg, naik sebagian",
      "Intermittent fasting: tidak berhasil",
    ]);
    expect(lines["Berat & tinggi (ukuran mandiri)"]).toEqual(["72 kg · 158 cm · IMT 28,8"]);
    expect(lines["Pola makan sehari"]).toEqual(["Pagi: Nasi kuning, teh manis", "Siang: Nasi, ikan bakar"]);
    expect(lines["Kesehatan"]).toEqual([
      "Darah tinggi: Amlodipine 5 mg, 1× sehari",
      "Diabetes: tidak minum obat",
      "Obat/suplemen lain: Vitamin D, pil KB",
      "Alergi: Amoxicillin (gatal-gatal)",
      "Hamil/menyusui: Tidak",
    ]);
  });

  it("merangkum Aesthetic dan Belum yakin", () => {
    const aesthetic = Object.fromEntries(describeAnswers(aestheticNewPatient).map((s) => [s.title, s.lines]));
    expect(aesthetic["Keluhan kulit"]).toEqual([
      "Keluhan: Jerawat & bekasnya, Pori-pori besar",
      "Jenis kulit: Berminyak",
      "Lama keluhan: 3–12 bulan",
    ]);
    expect(aesthetic["Perawatan sebelumnya"]).toEqual([
      "Treatment: Facial / peeling",
      "Skincare: Sabun cuci muka, sunscreen",
    ]);
    expect(aesthetic["Kesehatan"][0]).toBe("Riwayat penyakit: tidak ada");

    const unsure = describeAnswers(unsureNewPatient);
    expect(unsure[1]).toEqual({
      title: "Cerita pasien",
      step: "B1",
      lines: ["Ingin konsultasi soal berat badan dan jerawat."],
    });
  });

  it("merangkum kuis pendek pasien lama beserta aktivitasnya", () => {
    const sections = Object.fromEntries(describeAnswers(slimmingReturningPatient).map((s) => [s.title, s.lines]));
    expect(sections["Tujuan konsultasi"]).toEqual(["Slimming · pasien lama"]);
    expect(sections["Kunjungan ini"]).toEqual([
      "Berat turun 2 kg, sering lapar malam.",
      "Ada perubahan penyakit atau obat",
    ]);
    expect(sections["Aktivitas kemarin"][0]).toBe("06.00 · Kapsul/obat · Kapsul M");
  });

  it("tidak pernah menulis −0 kg atau undefined untuk jawaban yang belum lengkap", () => {
    const sections = describeAnswers({
      patientType: "BARU",
      purpose: "SLIMMING",
      slimming: {
        dietHistory: "PERNAH",
        dietPrograms: ["KETO", "OLAHRAGA"],
        dietResults: {
          KETO: { outcome: "BERHASIL" },
          OLAHRAGA: { outcome: "MASIH_JALAN" },
        },
      },
      health: {
        conditions: ["TIDAK_ADA"],
        otherMeds: { has: true },
        allergies: { has: true },
      },
    });
    const joined = sections.map((s) => s.lines.join("|")).join("|");
    expect(joined).toContain("Keto: berhasil");
    expect(joined).toContain("Olahraga / gym: masih jalan");
    expect(joined).toContain("Obat/suplemen lain: belum diisi");
    expect(joined).toContain("Alergi: belum diisi");
    expect(joined).not.toMatch(/undefined|−0 kg/);
  });
});
