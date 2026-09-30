import { describe, expect, it } from "vitest";
import {
  formatSignedDecimal,
  initialContextTab,
  parseVitalValues,
  vitalsTrend,
  weightChangeNote,
  type VitalKey,
} from "@/lib/encounter";

const none: Record<VitalKey, number | null> = {
  systolic: null,
  diastolic: null,
  pulse: null,
  temperatureC: null,
  weightKg: null,
  heightCm: null,
  waistCm: null,
};
// 03.00 UTC = 11.00 WITA. 9, 16, dan 23 Sep 2026 adalah hari Rabu.
const day = (date: string) => new Date(`${date}T03:00:00Z`);

describe("vitalsTrend", () => {
  it("baris pertama kunjungan ini, lalu kunjungan berangka, dengan selisih dan total sejak awal", () => {
    const trend = vitalsTrend({ ...none, weightKg: 72.5, heightCm: 158, waistCm: 92, systolic: 120, diastolic: 80 }, [
      { date: day("2026-09-23"), vitals: { ...none, weightKg: 73.3, heightCm: 158, waistCm: 94, systolic: 130, diastolic: 85 } },
      { date: day("2026-09-19"), vitals: { ...none, pulse: 80 } },
      { date: day("2026-09-16"), vitals: { ...none, weightKg: 74.5, waistCm: 95 } },
      { date: day("2026-09-09"), vitals: { ...none, weightKg: 75, waistCm: 97, systolic: 140, diastolic: 90 } },
    ]);

    expect(trend.empty).toBe(false);
    expect(trend.rows.map((row) => row.current)).toEqual([true, false, false, false]);
    expect(trend.rows[0]).toMatchObject({ date: null, weightKg: 72.5, bmi: 29, waistCm: 92, bloodPressure: "120/80", weightDelta: -0.8, waistDelta: -2 });
    expect(trend.rows[1]).toMatchObject({ bmi: 29.4, weightDelta: -1.2, waistDelta: -1 });
    expect(trend.rows[2]).toMatchObject({ bmi: null, bloodPressure: null, weightDelta: -0.5, waistDelta: -2 });
    expect(trend.rows[3]).toMatchObject({ bloodPressure: "140/90", weightDelta: null, waistDelta: null });
    expect(trend.summary.weight).toEqual({ delta: -2.5, since: day("2026-09-09") });
    expect(trend.summary.waist).toEqual({ delta: -5, since: day("2026-09-09") });
  });

  it("selisih dihitung terhadap baris berikutnya yang punya angka itu", () => {
    const trend = vitalsTrend({ ...none, weightKg: 72.5 }, [
      { date: day("2026-09-23"), vitals: { ...none, waistCm: 94 } },
      { date: day("2026-09-16"), vitals: { ...none, weightKg: 74 } },
    ]);
    expect(trend.rows[0].weightDelta).toBe(-1.5);
    expect(trend.rows[1].waistDelta).toBeNull();
  });

  it("tensi sebagian tidak ditampilkan, dan baris kunjungan ini tetap ada walau kosong", () => {
    const trend = vitalsTrend({ ...none, systolic: 120 }, [{ date: day("2026-09-23"), vitals: { ...none, weightKg: 73 } }]);
    expect(trend.rows[0]).toMatchObject({ current: true, bloodPressure: null, weightKg: null, weightDelta: null });
    expect(trend.rows).toHaveLength(2);
    expect(trend.summary.weight).toBeNull();
  });

  it("kosong bila kunjungan ini dan kunjungan sebelumnya tidak punya angka yang ditampilkan", () => {
    expect(vitalsTrend(none, [{ date: day("2026-09-23"), vitals: { ...none, pulse: 80 } }]).empty).toBe(true);
    expect(vitalsTrend(none, []).empty).toBe(true);
  });
});

describe("weightChangeNote", () => {
  const history = [
    { date: day("2026-09-23"), vitals: { ...none, pulse: 80 } },
    { date: day("2026-09-16"), vitals: { ...none, weightKg: 73.3 } },
  ];

  it("menyebut turun, naik, atau sama terhadap kunjungan final terakhir yang ditimbang", () => {
    expect(weightChangeNote(72.5, history)).toBe("berat turun 0,8 kg dari Rab, 16 Sep");
    expect(weightChangeNote(74, history)).toBe("berat naik 0,7 kg dari Rab, 16 Sep");
    expect(weightChangeNote(73.3, history)).toBe("berat sama dengan Rab, 16 Sep");
  });

  it("tidak ada catatan tanpa berat hari ini atau tanpa pembanding", () => {
    expect(weightChangeNote(null, history)).toBeNull();
    expect(weightChangeNote(72, [{ date: day("2026-09-23"), vitals: { ...none, pulse: 80 } }])).toBeNull();
  });
});

describe("pembantu tren", () => {
  it("parseVitalValues mengubah isian kosong atau tidak sah menjadi null", () => {
    const inputs = { systolic: "12", diastolic: "", pulse: "80", temperatureC: "36,5", weightKg: "72,55", heightCm: "158", waistCm: " " };
    expect(parseVitalValues(inputs)).toEqual({ ...none, pulse: 80, temperatureC: 36.5, heightCm: 158 });
  });

  it("formatSignedDecimal memakai tanda minus dan koma", () => {
    expect(formatSignedDecimal(-0.8)).toBe("−0,8");
    expect(formatSignedDecimal(2)).toBe("+2");
    expect(formatSignedDecimal(0)).toBe("±0");
  });

  it("tab awal: isian bila ada, lalu kunjungan sebelumnya, lalu tren", () => {
    expect(initialContextTab({ hasIntake: true, hasHistory: true })).toBe("intake");
    expect(initialContextTab({ hasIntake: false, hasHistory: true })).toBe("previous");
    expect(initialContextTab({ hasIntake: false, hasHistory: false })).toBe("trend");
  });
});
