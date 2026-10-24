import { describe, expect, it } from "vitest";
import { isReturnInterval, RETURN_INTERVALS, returnIntervalLabel, returnIntervalPhrase } from "@/lib/treatment-reminder";

describe("jarak pengingat treatment (spec pengingat treatment PT2, PT11)", () => {
  it("pilihan, label, dan frasa pesan", () => {
    expect(RETURN_INTERVALS).toEqual([7, 14, 21, 30, 60, 90, 180]);
    expect(RETURN_INTERVALS.map(returnIntervalLabel)).toEqual(["1 minggu", "2 minggu", "3 minggu", "1 bulan", "2 bulan", "3 bulan", "6 bulan"]);
    expect(returnIntervalLabel(null)).toBe("Tidak diingatkan");
    expect(RETURN_INTERVALS.map(returnIntervalPhrase)).toEqual([
      "setiap minggu",
      "setiap 2 minggu",
      "setiap 3 minggu",
      "setiap bulan",
      "setiap 2 bulan",
      "setiap 3 bulan",
      "setiap 6 bulan",
    ]);
  });

  it("hanya pilihan yang ada yang sah", () => {
    expect(isReturnInterval(14)).toBe(true);
    expect(isReturnInterval(10)).toBe(false);
    expect(isReturnInterval("7")).toBe(false);
    expect(isReturnInterval(null)).toBe(false);
  });
});
