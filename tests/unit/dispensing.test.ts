import { describe, expect, it } from "vitest";
import {
  DISPENSING_STATUS_LABEL,
  dispensingNotice,
  HOLD_MESSAGE,
  isDispensingView,
  shortageMessage,
  stockShortage,
  totalsByItem,
  USAGE_MAX,
  validateDispensingLine,
} from "@/lib/dispensing";

describe("validateDispensingLine", () => {
  const ok = { itemId: "it1", quantity: 2, usage: "3 x 1 sesudah makan" };

  it("menerima baris yang sah dan memangkas aturan pakai", () => {
    expect(validateDispensingLine({ ...ok, usage: "  3 x 1  " })).toEqual({ ok: true, value: { itemId: "it1", quantity: 2, usage: "3 x 1" } });
  });

  it("menolak jumlah pecahan, nol, negatif, atau bukan angka", () => {
    for (const quantity of [0, -1, 1.5, Number.NaN, "2", null]) {
      expect(validateDispensingLine({ ...ok, quantity })).toEqual({ ok: false, message: "Jumlah harus bilangan bulat lebih dari 0." });
    }
  });

  it("menolak aturan pakai kosong atau terlalu panjang", () => {
    expect(validateDispensingLine({ ...ok, usage: "   " })).toEqual({ ok: false, message: "Isi aturan pakai." });
    expect(validateDispensingLine({ ...ok, usage: undefined })).toEqual({ ok: false, message: "Isi aturan pakai." });
    expect(validateDispensingLine({ ...ok, usage: "x".repeat(USAGE_MAX + 1) })).toEqual({
      ok: false,
      message: "Aturan pakai paling banyak 200 karakter.",
    });
    expect(validateDispensingLine({ ...ok, usage: "x".repeat(USAGE_MAX) }).ok).toBe(true);
  });

  it("menolak barang kosong dan masukan buatan", () => {
    expect(validateDispensingLine({ ...ok, itemId: "" })).toEqual({ ok: false, message: "Pilih obat dari daftar." });
    expect(validateDispensingLine({ ...ok, itemId: 7 })).toEqual({ ok: false, message: "Pilih obat dari daftar." });
    expect(validateDispensingLine(null)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
    expect(validateDispensingLine([])).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("ringkasan per barang dan kekurangan stok", () => {
  const lines = [
    { itemId: "a", itemName: "Amoxicillin", quantity: 5 },
    { itemId: "b", itemName: "Vitamin C", quantity: 2 },
    { itemId: "a", itemName: "Amoxicillin", quantity: 4 },
  ];

  it("menjumlahkan barang yang sama di beberapa baris, urutan kemunculan pertama", () => {
    expect(totalsByItem(lines)).toEqual([
      { itemId: "a", itemName: "Amoxicillin", quantity: 9 },
      { itemId: "b", itemName: "Vitamin C", quantity: 2 },
    ]);
  });

  it("mendeteksi kekurangan dengan jumlah gabungan, bukan per baris", () => {
    const available = new Map([["a", 8], ["b", 10]]);
    expect(stockShortage(totalsByItem(lines), available)).toEqual({ itemName: "Amoxicillin", available: 8 });
    expect(shortageMessage({ itemName: "Amoxicillin", available: 8 })).toBe("Stok Amoxicillin tidak cukup (tersedia 8).");
  });

  it("barang yang tidak ada di peta dianggap tersedia 0; cukup berarti tidak ada kekurangan", () => {
    expect(stockShortage([{ itemId: "z", itemName: "Z", quantity: 1 }], new Map())).toEqual({ itemName: "Z", available: 0 });
    expect(stockShortage(totalsByItem(lines), new Map([["a", 9], ["b", 2]]))).toBeNull();
  });
});

describe("status dan pemberitahuan", () => {
  it("label dan tampilan", () => {
    expect(DISPENSING_STATUS_LABEL).toEqual({ MENUNGGU: "Menunggu", SELESAI: "Selesai", TANPA_OBAT: "Tanpa obat" });
    expect(isDispensingView("SELESAI")).toBe(true);
    expect(isDispensingView("lain")).toBe(false);
  });

  it("pemberitahuan di tagihan: hanya bila kunjungan punya penyerahan", () => {
    expect(dispensingNotice(null)).toBeNull();
    expect(dispensingNotice("MENUNGGU")).toBe(HOLD_MESSAGE);
    expect(dispensingNotice("SELESAI")).toBe("Obat sudah diserahkan.");
    expect(dispensingNotice("TANPA_OBAT")).toBe("Apoteker menandai tanpa obat.");
  });
});
