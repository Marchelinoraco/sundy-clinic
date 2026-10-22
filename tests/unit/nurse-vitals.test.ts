import { describe, expect, it } from "vitest";
import { nurseGateApplies, nurseVitalsLabel } from "@/lib/nurse-vitals";
import { combineWitaDateAndMinutes } from "@/lib/time";

const today = "2026-10-23";
const at = (date: string) => combineWitaDateAndMinutes(date, 9 * 60);

describe("angka vital perawat (spec vital perawat VP4, VP6)", () => {
  it("dokter menunggu perawat hanya untuk kunjungan klinik hari ini yang belum dibuka", () => {
    expect(nurseGateApplies({ channel: "KLINIK", startAt: at(today), hasEncounter: false }, today)).toBe(true);
    expect(nurseGateApplies({ channel: "ONLINE", startAt: at(today), hasEncounter: false }, today)).toBe(false);
    expect(nurseGateApplies({ channel: "KLINIK", startAt: at("2026-10-22"), hasEncounter: false }, today)).toBe(false);
    expect(nurseGateApplies({ channel: "KLINIK", startAt: at(today), hasEncounter: true }, today)).toBe(false);
  });

  it("nama perawat dan jam; ditandai bila dokter mengubah angka", () => {
    const measuredAt = combineWitaDateAndMinutes(today, 9 * 60 + 15);
    expect(nurseVitalsLabel({ byName: "Rina", at: measuredAt, changedByDoctor: false })).toBe("Diukur perawat Rina · 09.15");
    expect(nurseVitalsLabel({ byName: "Rina", at: measuredAt, changedByDoctor: true })).toBe("Diukur perawat Rina · 09.15 · diubah dokter");
  });
});
