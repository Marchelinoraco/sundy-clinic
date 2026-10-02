import { describe, expect, it } from "vitest";
import {
  CLINIC_FOUNDED_YEAR,
  CUSTOMER_COUNT,
  OPENING_DAYS,
  OPENING_HOURS,
  OPENING_TIME,
} from "@/lib/clinic";

describe("data klinik", () => {
  it("menyusun jam buka dari hari dan jam, tanpa mengubah teks yang sudah tayang", () => {
    expect(OPENING_DAYS).toBe("Senin–Sabtu");
    expect(OPENING_TIME).toBe("11.00–19.00");
    expect(OPENING_HOURS).toBe("Senin–Sabtu, 11.00–19.00 WITA");
  });

  it("memakai angka dari pemilik", () => {
    expect(CUSTOMER_COUNT).toBe(700);
    expect(CLINIC_FOUNDED_YEAR).toBe(2026);
  });
});
