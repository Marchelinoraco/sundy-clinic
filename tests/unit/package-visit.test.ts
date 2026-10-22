import { describe, expect, it } from "vitest";
import { defaultPerVisit, packageVisitMessage, planVisits, validatePlanDate, visitContentsLabel } from "@/lib/package-visit";

const facial = { name: "Facial Brightening", unit: null, remaining: 4, perVisit: null };
const rf = { name: "RF Perut", unit: null, remaining: 2, perVisit: null };
const capsule = { name: "Slimming Capsule", unit: "kapsul", remaining: 28, perVisit: 7 };

describe("rencana kunjungan paket (spec jadwal paket JP3, JP13)", () => {
  it("1 sesi tiap treatment yang bersisa + jumlah per kunjungan tiap barang, tiap jarak hari", () => {
    const plan = planVisits({ nextVisitOn: "2026-10-22", intervalDays: 7, visitsDone: 0, items: [facial, rf, capsule] });
    expect(plan.map((visit) => [visit.number, visit.date, visitContentsLabel(visit.contents)])).toEqual([
      [1, "2026-10-22", "Facial Brightening, RF Perut, 7 kapsul Slimming Capsule"],
      [2, "2026-10-29", "Facial Brightening, RF Perut, 7 kapsul Slimming Capsule"],
      [3, "2026-11-05", "Facial Brightening, 7 kapsul Slimming Capsule"],
      [4, "2026-11-12", "Facial Brightening, 7 kapsul Slimming Capsule"],
    ]);
  });

  it("sisa yang tidak habis dibagi menjadi kunjungan terakhir; paket barang saja; nomor melanjutkan kunjungan yang sudah terjadi", () => {
    const odd = planVisits({ nextVisitOn: "2026-10-22", intervalDays: 7, visitsDone: 0, items: [{ ...capsule, remaining: 30 }] });
    expect(odd.map((visit) => visit.contents[0].quantity)).toEqual([7, 7, 7, 7, 2]);
    const later = planVisits({ nextVisitOn: "2026-11-02", intervalDays: 7, visitsDone: 1, items: [{ ...facial, remaining: 3 }] });
    expect(later.map((visit) => [visit.number, visit.date])).toEqual([
      [2, "2026-11-02"],
      [3, "2026-11-09"],
      [4, "2026-11-16"],
    ]);
    expect(planVisits({ nextVisitOn: null, intervalDays: 7, visitsDone: 0, items: [facial] })).toEqual([]);
    expect(planVisits({ nextVisitOn: "2026-10-22", intervalDays: 7, visitsDone: 4, items: [{ ...facial, remaining: 0 }] })).toEqual([]);
  });

  it("jumlah per kunjungan bawaan: dibagi rata dengan sesi terbanyak, atau semuanya tanpa treatment (JP15)", () => {
    expect(defaultPerVisit(28, 4)).toBe(7);
    expect(defaultPerVisit(30, 4)).toBe(8);
    expect(defaultPerVisit(28, 0)).toBe(28);
  });

  it("pesan WhatsApp: besok, atau hari dan tanggal lengkap", () => {
    const contents = planVisits({ nextVisitOn: "2026-10-29", intervalDays: 7, visitsDone: 1, items: [facial, capsule] })[0].contents;
    const base = { patientName: "Maria Sului", packageName: "Glowing 3 Bulan", visitNumber: 2, contents };
    expect(packageVisitMessage({ ...base, visitOn: "2026-10-29", today: "2026-10-28" })).toBe(
      "Halo Maria, ini SunDY Clinic. Sesuai program paket Glowing 3 Bulan, jadwal kunjungan ke-2 Anda besok: Facial Brightening, 7 kapsul Slimming Capsule. Balas pesan ini untuk memilih jam ya. Terima kasih.",
    );
    expect(packageVisitMessage({ ...base, visitOn: "2026-11-05", today: "2026-10-28" })).toContain("jadwal kunjungan ke-2 Anda pada Kamis, 5 November 2026:");
  });

  it("rencana hari ini dan yang terlewat tidak menyebut tanggal lampau sebagai jadwal (temuan review I3)", () => {
    const contents = planVisits({ nextVisitOn: "2026-10-22", intervalDays: 7, visitsDone: 1, items: [facial, capsule] })[0].contents;
    const base = { patientName: "Maria Sului", packageName: "Glowing 3 Bulan", visitNumber: 2, contents };
    expect(packageVisitMessage({ ...base, visitOn: "2026-10-28", today: "2026-10-28" })).toBe(
      "Halo Maria, ini SunDY Clinic. Sesuai program paket Glowing 3 Bulan, jadwal kunjungan ke-2 Anda hari ini: Facial Brightening, 7 kapsul Slimming Capsule. Balas pesan ini untuk memilih jam ya. Terima kasih.",
    );
    expect(packageVisitMessage({ ...base, visitOn: "2026-10-22", today: "2026-10-28" })).toBe(
      "Halo Maria, ini SunDY Clinic. Sesuai program paket Glowing 3 Bulan, sudah waktunya kunjungan ke-2 Anda (rencana Kamis, 22 Oktober 2026): Facial Brightening, 7 kapsul Slimming Capsule. Balas pesan ini untuk memilih hari dan jam ya. Terima kasih.",
    );
  });

  it("tanggal rencana baru: tidak sebelum hari ini, tidak melewati masa berlaku (JP16)", () => {
    const ctx = { today: "2026-10-28", expiresOn: "2027-01-19" };
    expect(validatePlanDate("2026-10-27", ctx)).toEqual({ ok: false, message: "Tanggal rencana tidak boleh sebelum hari ini." });
    expect(validatePlanDate("2027-01-20", ctx)).toEqual({ ok: false, message: "Tanggal rencana melewati masa berlaku paket (19 Jan 2027)." });
    expect(validatePlanDate("x", ctx)).toEqual({ ok: false, message: "Isi tanggal rencana." });
    expect(validatePlanDate("2026-11-08", ctx)).toEqual({ ok: true, value: "2026-11-08" });
  });
});
