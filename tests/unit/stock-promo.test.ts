import { describe, expect, it } from "vitest";
import { activePromo, promoDiscount, promoLabel, validatePromo, type PromoFields } from "@/lib/stock-promo";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const persen: PromoFields = { promoName: "Promo Oktober", promoKind: "PERSEN", promoValue: 10, promoStartsOn: d("2026-10-01"), promoEndsOn: d("2026-10-31") };
const none: PromoFields = { promoName: null, promoKind: null, promoValue: 0, promoStartsOn: null, promoEndsOn: null };

describe("promo berlaku", () => {
  it("inklusif pada hari mulai dan selesai; tidak sebelum atau sesudah", () => {
    expect(activePromo(persen, "2026-09-30")).toBeNull();
    expect(activePromo(persen, "2026-10-01")).toEqual({ name: "Promo Oktober", kind: "PERSEN", value: 10 });
    expect(activePromo(persen, "2026-10-31")).not.toBeNull();
    expect(activePromo(persen, "2026-11-01")).toBeNull();
  });

  it("sisi tanggal kosong berarti tanpa batas; tanpa promo selalu null", () => {
    expect(activePromo({ ...persen, promoStartsOn: null }, "2020-01-01")).not.toBeNull();
    expect(activePromo({ ...persen, promoEndsOn: null }, "2099-01-01")).not.toBeNull();
    expect(activePromo(none, "2026-10-15")).toBeNull();
  });
});

describe("promoDiscount", () => {
  it("persen dari harga baris dibulatkan ke bawah, dengan alasan Promo: nama", () => {
    expect(promoDiscount(persen, { quantity: 2, unitPrice: 150_000 }, "2026-10-15")).toEqual({ amount: 30_000, reason: "Promo: Promo Oktober" });
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 9_999 }, "2026-10-15")).toEqual({ amount: 999, reason: "Promo: Promo Oktober" });
  });

  it("nominal per unit dikali jumlah, tidak melebihi harga baris", () => {
    const nominal: PromoFields = { ...persen, promoKind: "NOMINAL", promoValue: 10_000 };
    expect(promoDiscount(nominal, { quantity: 3, unitPrice: 50_000 }, "2026-10-15")?.amount).toBe(30_000);
    expect(promoDiscount(nominal, { quantity: 3, unitPrice: 5_000 }, "2026-10-15")?.amount).toBe(15_000);
  });

  it("tidak berlaku, harga Rp0, atau hasil Rp0 → null", () => {
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 1000 }, "2026-11-02")).toBeNull();
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 0 }, "2026-10-15")).toBeNull();
    expect(promoDiscount(persen, { quantity: 1, unitPrice: 5 }, "2026-10-15")).toBeNull();
  });
});

describe("validatePromo", () => {
  it("tanpa jenis → promo dikosongkan", () => {
    expect(validatePromo({ name: "x", kind: null, value: 5, startsOn: "", endsOn: "" })).toEqual({ ok: true, value: none });
  });

  it("promo lengkap; tanggal opsional", () => {
    expect(validatePromo({ name: " Promo Oktober ", kind: "PERSEN", value: 10, startsOn: "2026-10-01", endsOn: "" })).toEqual({
      ok: true,
      value: { promoName: "Promo Oktober", promoKind: "PERSEN", promoValue: 10, promoStartsOn: d("2026-10-01"), promoEndsOn: null },
    });
  });

  it("menolak nama kosong, nilai tidak sah, persen > 100, dan tanggal selesai sebelum mulai", () => {
    expect(validatePromo({ name: "", kind: "PERSEN", value: 10, startsOn: "", endsOn: "" })).toEqual({ ok: false, message: "Isi nama promo." });
    expect(validatePromo({ name: "x", kind: "PERSEN", value: 101, startsOn: "", endsOn: "" })).toEqual({ ok: false, message: "Persen promo harus 1 sampai 100." });
    expect(validatePromo({ name: "x", kind: "NOMINAL", value: 0, startsOn: "", endsOn: "" })).toEqual({ ok: false, message: "Nominal promo harus lebih dari 0." });
    expect(validatePromo({ name: "x", kind: "PERSEN", value: 5, startsOn: "2026-10-10", endsOn: "2026-10-09" })).toEqual({
      ok: false,
      message: "Tanggal selesai tidak boleh sebelum tanggal mulai.",
    });
    expect(validatePromo({ name: "x", kind: "PERSEN", value: 5, startsOn: "10/10/2026", endsOn: "" }).ok).toBe(false);
    expect(validatePromo(null).ok).toBe(false);
  });
});

describe("promoLabel", () => {
  it("ringkas untuk daftar barang", () => {
    expect(promoLabel(persen)).toBe("Promo Oktober · 10% · 1 Okt 2026–31 Okt 2026");
    expect(promoLabel({ ...persen, promoKind: "NOMINAL", promoValue: 10_000, promoStartsOn: null, promoEndsOn: null })).toBe("Promo Oktober · Rp 10.000/unit");
    expect(promoLabel(none)).toBeNull();
  });
});
