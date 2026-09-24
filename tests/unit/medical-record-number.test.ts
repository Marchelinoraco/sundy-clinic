import { describe, expect, it } from "vitest";
import { formatMedicalRecordNumber } from "@/lib/medical-record-number";

describe("formatMedicalRecordNumber", () => {
  it("memformat dengan angka empat digit berisi nol di depan", () => {
    expect(formatMedicalRecordNumber(2026, 1)).toBe("SDY-2026-0001");
    expect(formatMedicalRecordNumber(2026, 42)).toBe("SDY-2026-0042");
  });

  it("tidak memotong urutan yang sudah lima digit", () => {
    expect(formatMedicalRecordNumber(2026, 10000)).toBe("SDY-2026-10000");
  });
});
