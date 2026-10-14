import { describe, expect, it } from "vitest";
import { billingLabel, isIncompletePrescription, parsePrescriptions, stockWarnings, validateReduction } from "@/lib/prescription";

const row = { itemId: "o1", quantity: " 10 ", usage: "  3 x 1 sesudah makan " };

describe("resep dokter", () => {
  it("merapikan baris resep", () => {
    expect(parsePrescriptions([row])).toEqual({ ok: true, value: [{ itemId: "o1", quantity: 10, usage: "3 x 1 sesudah makan" }] });
    expect(parsePrescriptions([])).toEqual({ ok: true, value: [] });
  });

  it.each([
    [{ itemId: "" }, "Pilih obat dari daftar."],
    [{ quantity: "0" }, "Jumlah obat harus bilangan bulat 1–9.999."],
    [{ quantity: "1,5" }, "Jumlah obat harus bilangan bulat 1–9.999."],
    [{ quantity: "10000" }, "Jumlah obat harus bilangan bulat 1–9.999."],
    [{ usage: " " }, "Isi aturan pakai obat."],
    [{ usage: "x".repeat(201) }, "Aturan pakai terlalu panjang (maks. 200 karakter)."],
  ])("menolak %j", (patch, message) => {
    expect(parsePrescriptions([{ ...row, ...patch }])).toEqual({ ok: false, message });
  });

  it("paling banyak 30 obat", () => {
    expect(parsePrescriptions(Array.from({ length: 31 }, () => row))).toEqual({ ok: false, message: "Paling banyak 30 obat per resep." });
  });

  it("peringatan stok menjumlahkan baris obat yang sama", () => {
    const medicines = [
      { id: "o1", code: "A", name: "Amoxicillin", unit: "kapsul", available: 4 },
      { id: "o2", code: "B", name: "Vitamin", unit: "tablet", available: 30 },
    ];
    const warnings = stockWarnings(
      [
        { itemId: "o1", quantity: 3 },
        { itemId: "o1", quantity: 2 },
        { itemId: "o2", quantity: 10 },
      ],
      medicines,
    );
    expect(warnings.get("o1")).toBe("Sisa stok 4 kapsul — tagihan tertahan sampai stok cukup atau jumlah dikurangi.");
    expect(warnings.has("o2")).toBe(false);
    expect(stockWarnings([{ itemId: "hilang", quantity: 1 }], medicines).has("hilang")).toBe(false);
  });

  it("pengurangan oleh resepsionis: 0 sampai jumlah resep; alasan wajib bila kurang dari resep", () => {
    expect(validateReduction({ quantity: 5, reason: " Stok kurang " }, { prescribed: 10 })).toEqual({ ok: true, value: { quantity: 5, reason: "Stok kurang" } });
    expect(validateReduction({ quantity: 0, reason: "Menolak" }, { prescribed: 10 })).toEqual({ ok: true, value: { quantity: 0, reason: "Menolak" } });
    expect(validateReduction({ quantity: 11, reason: "Stok" }, { prescribed: 10 })).toEqual({ ok: false, message: "Jumlah ditagih harus 0–10." });
    expect(validateReduction({ quantity: 1.5, reason: "Stok" }, { prescribed: 10 })).toEqual({ ok: false, message: "Jumlah ditagih harus 0–10." });
    expect(validateReduction({ quantity: 5, reason: "x" }, { prescribed: 10 })).toEqual({ ok: false, message: "Alasan 2–200 karakter." });
  });

  it("kembali ke jumlah resep: alasan tidak wajib dan tidak disimpan", () => {
    expect(validateReduction({ quantity: 10, reason: "" }, { prescribed: 10 })).toEqual({ ok: true, value: { quantity: 10, reason: null } });
    expect(validateReduction({ quantity: 10, reason: "Stok ada lagi" }, { prescribed: 10 })).toEqual({ ok: true, value: { quantity: 10, reason: null } });
  });

  it("keterangan penagihan untuk dokter", () => {
    expect(billingLabel({ quantity: 10, billedQuantity: null, billingNote: null })).toBeNull();
    expect(billingLabel({ quantity: 10, billedQuantity: 5, billingNote: "Stok kurang" })).toBe("Ditagih 5 dari 10 — Stok kurang");
    expect(billingLabel({ quantity: 10, billedQuantity: 0, billingNote: "Customer menolak" })).toBe("Tidak ditagih — Customer menolak");
  });

  it("baris belum lengkap: obat, jumlah, atau aturan pakai masih kosong", () => {
    expect(isIncompletePrescription({ itemId: "", quantity: "1", usage: "3 x 1" })).toBe(true);
    expect(isIncompletePrescription({ itemId: "o1", quantity: " ", usage: "3 x 1" })).toBe(true);
    expect(isIncompletePrescription({ itemId: "o1", quantity: "1", usage: "  " })).toBe(true);
    expect(isIncompletePrescription({ itemId: "o1", quantity: "1", usage: "3 x 1" })).toBe(false);
    // Isian yang salah bukan "belum lengkap": tetap diperiksa dan pesannya tampil.
    expect(isIncompletePrescription({ itemId: "o1", quantity: "0", usage: "3 x 1" })).toBe(false);
  });
});
