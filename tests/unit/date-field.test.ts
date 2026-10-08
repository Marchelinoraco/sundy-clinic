import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { dateTextToDayjs, dayjsToDateText, dayjsToMonthText, monthTextToDayjs } from "@/lib/date-field";

describe("konversi isian tanggal", () => {
  it.each(["2026-10-08", "2026-01-01", "2026-12-31", "2024-02-29"])("%s bolak-balik tanpa bergeser sehari", (text) => {
    expect(dayjsToDateText(dateTextToDayjs(text))).toBe(text);
  });

  it("teks kosong, mustahil, atau berformat lain → null", () => {
    expect(dateTextToDayjs("")).toBeNull();
    expect(dateTextToDayjs("2026-02-30")).toBeNull();
    expect(dateTextToDayjs("08/10/2026")).toBeNull();
    expect(dateTextToDayjs("2026-10-8")).toBeNull();
  });

  it("nilai kosong, tidak sah, atau tahun belum lengkap → teks kosong", () => {
    expect(dayjsToDateText(null)).toBe("");
    expect(dayjsToDateText(dayjs("bukan tanggal"))).toBe("");
    expect(dayjsToDateText(dayjs("2026-10-08").year(2))).toBe("");
  });

  it("bulan: YYYY-MM bolak-balik; tidak sah → null/kosong", () => {
    expect(dayjsToMonthText(monthTextToDayjs("2026-10"))).toBe("2026-10");
    expect(dayjsToMonthText(monthTextToDayjs("2026-01"))).toBe("2026-01");
    expect(monthTextToDayjs("2026-13")).toBeNull();
    expect(monthTextToDayjs("")).toBeNull();
    expect(dayjsToMonthText(null)).toBe("");
  });
});
