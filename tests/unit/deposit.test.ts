import { describe, expect, it } from "vitest";
import { allocateCredits, DEPOSIT_REFUND_MIN, DEPOSIT_VALID_DAYS, depositValidUntil, isCreditActive } from "@/lib/deposit";

describe("masa berlaku deposit (spec deposit D7)", () => {
  it("berlaku 30 hari sejak dicatat; masih bisa dipakai pada tanggal itu, hangus sehari sesudahnya", () => {
    expect(DEPOSIT_VALID_DAYS).toBe(30);
    expect(DEPOSIT_REFUND_MIN).toBe(200_000);
    expect(depositValidUntil("2026-10-24")).toBe("2026-11-23");
    expect(depositValidUntil("2026-12-15")).toBe("2027-01-14");
    expect(isCreditActive("2026-11-23", "2026-11-23")).toBe(true);
    expect(isCreditActive("2026-11-23", "2026-11-24")).toBe(false);
  });
});

describe("alokasi saldo (spec deposit D6, D16)", () => {
  const credits = [
    { id: "c-lama", remaining: 50_000, validUntil: "2026-11-30" },
    { id: "c-hangus", remaining: 70_000, validUntil: "2026-10-20" },
    { id: "c-dulu", remaining: 40_000, validUntil: "2026-11-05" },
    { id: "c-baru", remaining: 100_000, validUntil: "2026-12-10" },
  ];

  it("hanya yang masih berlaku, kedaluwarsa paling dulu lebih dulu, potongan parsial di kredit terakhir", () => {
    expect(allocateCredits(credits, 120_000, "2026-10-24")).toEqual([
      { creditId: "c-dulu", amount: 40_000 },
      { creditId: "c-lama", amount: 50_000 },
      { creditId: "c-baru", amount: 30_000 },
    ]);
  });

  it("jumlah 0 atau tanpa saldo: kosong; melebihi saldo: berhenti saat saldo habis", () => {
    expect(allocateCredits(credits, 0, "2026-10-24")).toEqual([]);
    expect(allocateCredits([], 50_000, "2026-10-24")).toEqual([]);
    expect(allocateCredits(credits, 1_000_000, "2026-10-24").reduce((sum, part) => sum + part.amount, 0)).toBe(190_000);
  });

  it("urutan masuk dipertahankan bila tanggal kedaluwarsanya sama", () => {
    const same = [
      { id: "a", remaining: 10_000, validUntil: "2026-11-30" },
      { id: "b", remaining: 10_000, validUntil: "2026-11-30" },
    ];
    expect(allocateCredits(same, 15_000, "2026-10-24")).toEqual([
      { creditId: "a", amount: 10_000 },
      { creditId: "b", amount: 5_000 },
    ]);
  });
});
