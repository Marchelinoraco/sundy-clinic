import { describe, expect, it } from "vitest";
import type { HabitAnswers } from "@/lib/kuis/v2/answers";
import { describeAnswers, habitTable } from "@/lib/kuis/v2/describe";
import { nutritionNewPatient, slimmingNewPatient } from "../../../fixtures/quiz-answers-v2";

const linesOf = (sections: ReturnType<typeof describeAnswers>, step: string) =>
  sections.find((section) => section.step === step)?.lines;

describe("describeAnswers v2", () => {
  it("customer: nada customer dan form recall per layar", () => {
    const sections = describeAnswers(slimmingNewPatient, "customer");
    expect(sections[0].lines).toEqual(["Slimming · pertama kali ke SunDY"]);
    expect(JSON.stringify(sections)).not.toMatch(/pasien|berobat/i);
    expect(linesOf(sections, "F1")).toEqual(["Bangun 06.00 · tidur 22.00"]);
    expect(linesOf(sections, "F2")).toEqual(["07.00: Nasi kuning 1 piring, teh manis 1 gelas"]);
    expect(linesOf(sections, "F5")).toEqual(["Hampir setiap hari, 16.00: Pisang goreng 2 potong"]);
    expect(linesOf(sections, "F6")).toEqual(["Kadang-kadang: Jalan kaki, 30 menit, 2× seminggu, jam 17.00"]);
    expect(linesOf(sections, "F7")).toEqual(["Rokok: Tidak · Alkohol: Tidak · Soda: Kadang"]);
  });

  it("staf: 'pasien baru', keluhan, berat & tinggi; form recall tidak diulang sebagai baris", () => {
    const sections = describeAnswers(nutritionNewPatient, "staff");
    expect(sections[0].lines).toEqual(["Konsultasi dokter spesialis gizi klinik · pasien baru"]);
    expect(linesOf(sections, "N1")).toEqual(["Gula darah tinggi, ingin atur pola makan."]);
    expect(linesOf(sections, "T1")).toEqual(["65 kg · 160 cm · IMT 25,4"]);
    expect(sections.some((section) => section.step.startsWith("F"))).toBe(false);
    expect(linesOf(sections, "K1")).toContain("Diabetes: Metformin 500 mg, 2× sehari");
  });
});

describe("habitTable", () => {
  const base = slimmingNewPatient.habits;
  const rowAt = (table: ReturnType<typeof habitTable>, label: string) => table.rows.find((row) => row.label === label);

  it("06.00–22.00 dengan setiap kebiasaan di jamnya, dan rokok/alkohol/soda di bawah tabel", () => {
    const table = habitTable(base);
    expect(table.rows.map((row) => row.label)).toEqual([
      "06.00", "07.00", "08.00", "09.00", "10.00", "11.00", "12.00", "13.00", "14.00",
      "15.00", "16.00", "17.00", "18.00", "19.00", "20.00", "21.00", "22.00",
    ]);
    expect(rowAt(table, "06.00")?.entries).toEqual(["Bangun tidur"]);
    expect(rowAt(table, "07.00")?.entries).toEqual(["Sarapan: Nasi kuning 1 piring, teh manis 1 gelas"]);
    expect(rowAt(table, "08.00")?.entries).toEqual([]);
    expect(rowAt(table, "16.00")?.entries).toEqual(["Cemilan (hampir setiap hari): Pisang goreng 2 potong"]);
    expect(rowAt(table, "17.00")?.entries).toEqual(["Olahraga: Jalan kaki, 30 menit, 2× seminggu"]);
    expect(rowAt(table, "22.00")?.entries).toEqual(["Tidur malam"]);
    expect(table.notes).toEqual(["Rokok: Tidak · Alkohol: Tidak · Soda: Kadang"]);
  });

  it("melebar untuk bangun 05.00, olahraga 05.00, dan tidur lewat tengah malam", () => {
    const table = habitTable({ ...base, wakeHour: 5, sleepHour: 1, exercise: { ...base.exercise, hour: 5 } });
    expect(table.rows[0]).toEqual({ hour: 5, label: "05.00", entries: ["Bangun tidur", "Olahraga: Jalan kaki, 30 menit, 2× seminggu"] });
    expect(table.rows.slice(-3).map((row) => row.label)).toEqual(["23.00", "00.00", "01.00"]);
    expect(table.rows.at(-1)?.entries).toEqual(["Tidur malam"]);
  });

  it("beberapa catatan di jam yang sama berurutan: bangun, makan, cemilan, olahraga, tidur", () => {
    const table = habitTable({
      ...base,
      wakeHour: 7,
      snack: { frequency: "SERING", hour: 17, text: "Kerupuk" },
    });
    expect(rowAt(table, "07.00")?.entries).toEqual(["Bangun tidur", "Sarapan: Nasi kuning 1 piring, teh manis 1 gelas"]);
    expect(rowAt(table, "17.00")?.entries).toEqual([
      "Cemilan (3–5× seminggu): Kerupuk",
      "Olahraga: Jalan kaki, 30 menit, 2× seminggu",
    ]);
  });

  it("yang tidak berjam tampil di bawah tabel", () => {
    const habits: HabitAnswers = {
      ...base,
      breakfast: { none: true },
      snack: { frequency: "KADANG", anytime: true, text: "Cokelat" },
      exercise: { routine: "TIDAK" },
    };
    expect(habitTable(habits).notes).toEqual([
      "Tidak sarapan",
      "Cemilan (1–2× seminggu): Cokelat — jam tidak tentu",
      "Tidak berolahraga",
      "Rokok: Tidak · Alkohol: Tidak · Soda: Kadang",
    ]);
    expect(habitTable({ ...base, snack: { frequency: "JARANG" } }).notes).toContain("Cemilan: jarang atau tidak pernah");
  });
});
