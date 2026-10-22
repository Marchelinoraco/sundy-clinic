import { describe, expect, it } from "vitest";
import {
  packageContentsLabel,
  packageCostSummary,
  packageExpiresOn,
  packageOptionsFor,
  packageOptionsSummary,
  packagePriceError,
  packageState,
  packageTargetLabel,
  sessionNote,
  type PackageOption,
  validateExtension,
  validateTreatmentPackage,
} from "@/lib/treatment-package";

const valid = { name: " Facial Glow 5x ", price: 1_500_000, validDays: 180, description: "", items: [{ serviceId: "s1", sessions: 5 }] };

describe("validateTreatmentPackage", () => {
  it("merapikan isian yang sah", () => {
    expect(validateTreatmentPackage(valid)).toEqual({ ok: true, value: { name: "Facial Glow 5x", price: 1_500_000, validDays: 180, description: null, visitIntervalDays: 7, items: [{ serviceId: "s1", itemId: null, sessions: 5, perVisit: null }] } });
  });

  it("menolak isian yang tidak sah dengan pesan yang jelas", () => {
    const bad = (patch: Record<string, unknown>) => validateTreatmentPackage({ ...valid, ...patch });
    expect(bad({ name: " " })).toEqual({ ok: false, message: "Isi nama paket." });
    expect(bad({ name: "x".repeat(121) })).toEqual({ ok: false, message: "Nama paket paling banyak 120 karakter." });
    expect(bad({ price: -1 })).toEqual({ ok: false, message: "Harga paket tidak sah." });
    expect(bad({ price: 1.5 })).toEqual({ ok: false, message: "Harga paket tidak sah." });
    expect(bad({ validDays: 0 })).toEqual({ ok: false, message: "Masa berlaku 1–3650 hari." });
    expect(bad({ description: "x".repeat(501) })).toEqual({ ok: false, message: "Keterangan paling banyak 500 karakter." });
    expect(bad({ items: [] })).toEqual({ ok: false, message: "Tambahkan minimal satu isi paket." });
    expect(bad({ items: [{ serviceId: "", sessions: 1 }] })).toEqual({ ok: false, message: "Pilih treatment." });
    expect(bad({ items: [{ serviceId: "s1", sessions: 0 }] })).toEqual({ ok: false, message: "Jumlah sesi 1–100." });
    expect(bad({ items: [{ serviceId: "s1", sessions: 1 }, { serviceId: "s1", sessions: 2 }] })).toEqual({ ok: false, message: "Treatment yang sama tidak boleh dua kali." });
    expect(validateTreatmentPackage(null)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });

  it("barang: jumlah 1–1000, tidak ganda, dan tidak boleh sekaligus treatment (spec paket barang PB1)", () => {
    const withItems = (items: unknown[]) => validateTreatmentPackage({ ...valid, items });
    expect(withItems([{ serviceId: "s1", sessions: 4 }, { itemId: "b1", sessions: 30 }])).toEqual({
      ok: true,
      value: {
        name: "Facial Glow 5x",
        price: 1_500_000,
        validDays: 180,
        description: null,
        visitIntervalDays: 7,
        items: [
          { serviceId: "s1", itemId: null, sessions: 4, perVisit: null },
          { serviceId: null, itemId: "b1", sessions: 30, perVisit: 8 },
        ],
      },
    });
    expect(withItems([{ itemId: "b1", sessions: 1000 }]).ok).toBe(true);
    expect(withItems([{ itemId: "", sessions: 1 }])).toEqual({ ok: false, message: "Pilih barang." });
    expect(withItems([{ itemId: "b1", sessions: 0 }])).toEqual({ ok: false, message: "Jumlah barang 1–1000." });
    expect(withItems([{ itemId: "b1", sessions: 1001 }])).toEqual({ ok: false, message: "Jumlah barang 1–1000." });
    expect(withItems([{ itemId: "b1", sessions: 2 }, { itemId: "b1", sessions: 3 }])).toEqual({ ok: false, message: "Barang yang sama tidak boleh dua kali." });
    expect(withItems([{ serviceId: "s1", itemId: "b1", sessions: 1 }])).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });
});

describe("tanggal dan status paket", () => {
  it("kedaluwarsa inklusif: 180 hari sejak 13 Okt 2026 = 10 Apr 2027; melewati 29 Februari", () => {
    expect(packageExpiresOn("2026-10-13", 180)).toBe("2027-04-10");
    expect(packageExpiresOn("2028-02-28", 2)).toBe("2028-02-29");
    expect(packageExpiresOn("2026-10-13", 1)).toBe("2026-10-13");
  });

  it("status: dibatalkan > habis > kedaluwarsa > aktif", () => {
    expect(packageState({ status: "DIBATALKAN", expiresOn: "2030-01-01", remaining: 3 }, "2026-10-13")).toBe("DIBATALKAN");
    expect(packageState({ status: "AKTIF", expiresOn: "2026-10-01", remaining: 0 }, "2026-10-13")).toBe("HABIS");
    expect(packageState({ status: "AKTIF", expiresOn: "2026-10-12", remaining: 2 }, "2026-10-13")).toBe("KEDALUWARSA");
    expect(packageState({ status: "AKTIF", expiresOn: "2026-10-13", remaining: 2 }, "2026-10-13")).toBe("AKTIF");
  });

  it("label isi dan catatan sesi", () => {
    expect(packageContentsLabel([{ name: "Facial", sessions: 3 }, { name: "Peeling", sessions: 2 }])).toBe("3× Facial, 2× Peeling");
    expect(packageContentsLabel([{ name: "Facial", sessions: 4 }, { name: "Slimming", sessions: 30, unit: "kapsul" }])).toBe("4× Facial, 30 kapsul Slimming");
    expect(sessionNote({ packageName: "Facial Glow 5x", remaining: 3, sessions: 5 })).toBe("Sesi paket Facial Glow 5x · sisa 3 dari 5");
    expect(sessionNote({ packageName: "Lux", remaining: 20, sessions: 30, unit: "kapsul" })).toBe("Jatah paket Lux · sisa 20 dari 30 kapsul");
  });
});

describe("packageOptionsFor", () => {
  const option = (patch: Partial<PackageOption>): PackageOption => ({
    patientPackageItemId: "i1",
    purchaseLineId: null,
    patientPackageId: "p1",
    packageName: "A",
    serviceId: "s1",
    itemId: null,
    serviceName: "Facial",
    unit: null,
    sessions: 5,
    remaining: 3,
    startsOn: "2026-01-01",
    expiresOn: "2026-12-31",
    ...patch,
  });

  it("hanya treatment yang sama dengan sisa cukup, kedaluwarsa terdekat dulu", () => {
    const options = [
      option({ patientPackageItemId: "late", expiresOn: "2027-06-01" }),
      option({ patientPackageItemId: "soon", expiresOn: "2026-11-01" }),
      option({ patientPackageItemId: "other", serviceId: "s2" }),
      option({ patientPackageItemId: "short", remaining: 1 }),
    ];
    expect(packageOptionsFor(options, { kind: "TREATMENT", serviceId: "s1", itemId: null }, 2).map((o) => o.patientPackageItemId)).toEqual(["soon", "late"]);
  });

  it("barang dicocokkan lewat itemId; paket yang dibeli di draf ini ikut ditawarkan (spec paket barang PB3)", () => {
    const options = [
      option({ patientPackageItemId: "kapsul", serviceId: null, itemId: "b1", unit: "kapsul", remaining: 30 }),
      option({ patientPackageItemId: null, purchaseLineId: "L1", patientPackageId: "baru:L1", serviceId: null, itemId: "b1", unit: "kapsul", remaining: 30, expiresOn: "2027-04-18" }),
      option({ patientPackageItemId: "facial" }),
    ];
    expect(packageOptionsFor(options, { kind: "BARANG", serviceId: null, itemId: "b1" }, 10).map((o) => o.patientPackageItemId ?? o.purchaseLineId)).toEqual(["kapsul", "L1"]);
    expect(packageOptionsFor(options, { kind: "BARANG", serviceId: "s1", itemId: null }, 1)).toEqual([]);
    expect(packageOptionsFor(options, { kind: "TREATMENT", serviceId: null, itemId: "b1" }, 1)).toEqual([]);
  });

  it("label pilihan menyebut paket baru dan satuan", () => {
    expect(packageTargetLabel(option({ remaining: 3, expiresOn: "2026-12-31" }))).toBe("A · sisa 3 · berlaku s.d. 31 Des 2026");
    expect(packageTargetLabel(option({ patientPackageItemId: null, purchaseLineId: "L1", serviceId: null, itemId: "b1", unit: "kapsul", remaining: 30 }))).toBe("A (dibeli di tagihan ini) · sisa 30 kapsul");
  });
});

describe("validateExtension", () => {
  it("tanggal baru harus setelah tanggal sekarang dan alasan wajib", () => {
    const ctx = { currentExpiresOn: "2026-12-31" };
    expect(validateExtension({ expiresOn: "2027-03-31", reason: " Customer sakit " }, ctx)).toEqual({ ok: true, value: { expiresOn: "2027-03-31", reason: "Customer sakit" } });
    expect(validateExtension({ expiresOn: "", reason: "x" }, ctx)).toEqual({ ok: false, message: "Isi tanggal berlaku baru." });
    expect(validateExtension({ expiresOn: "2026-12-31", reason: "x" }, ctx)).toEqual({ ok: false, message: "Tanggal baru harus setelah 31 Des 2026." });
    expect(validateExtension({ expiresOn: "2101-01-01", reason: "x" }, ctx)).toEqual({ ok: false, message: "Tanggal berlaku tidak sah." });
    expect(validateExtension({ expiresOn: "2027-01-01", reason: " " }, ctx)).toEqual({ ok: false, message: "Isi alasan perpanjangan." });
    expect(validateExtension({ expiresOn: "2027-01-01", reason: "x".repeat(201) }, ctx)).toEqual({ ok: false, message: "Alasan paling banyak 200 karakter." });
  });
});

describe("packageOptionsSummary", () => {
  it("satu teks per paket, treatment digabung, kedaluwarsa tertulis", () => {
    const base = { patientPackageId: "p1", purchaseLineId: null, itemId: null, unit: null, packageName: "Paket Glowing", sessions: 3, startsOn: "2026-10-01", expiresOn: "2027-04-12" };
    expect(
      packageOptionsSummary([
        { ...base, patientPackageItemId: "i1", serviceId: "s1", serviceName: "Facial", remaining: 2 },
        { ...base, patientPackageItemId: "i2", serviceId: "s2", serviceName: "Peeling", remaining: 1 },
        { ...base, patientPackageId: "p2", packageName: "Meso 2x", patientPackageItemId: "i3", serviceId: "s3", serviceName: "Meso", remaining: 2, expiresOn: "2026-12-31" },
      ]),
    ).toEqual(["Paket Glowing (sisa 2 Facial, 1 Peeling; berlaku s.d. 12 Apr 2027)", "Meso 2x (sisa 2 Meso; berlaku s.d. 31 Des 2026)"]);
  });

  it("barang memakai satuan; paket yang dibeli di draf ini ditandai", () => {
    const base = { patientPackageId: "p1", purchaseLineId: null, serviceId: null, packageName: "Lux", sessions: 30, startsOn: "2026-10-01", expiresOn: "2027-04-12" };
    expect(
      packageOptionsSummary([
        { ...base, patientPackageItemId: "i1", itemId: "b1", serviceName: "Slimming", unit: "kapsul", remaining: 20 },
        { ...base, patientPackageItemId: null, purchaseLineId: "L1", patientPackageId: "baru:L1", itemId: "b1", serviceName: "Slimming", unit: "kapsul", remaining: 30 },
      ]),
    ).toEqual(["Lux (sisa 20 kapsul Slimming; berlaku s.d. 12 Apr 2027)", "Lux (dibeli di tagihan ini: 30 kapsul Slimming)"]);
  });
});

describe("biaya dan selisih paket (spec paket informatif PI1–PI4)", () => {
  const lines = [
    { name: "Facial Brightening", unitPrice: 249_000, unitCost: 85_000, quantity: 4 },
    { name: "RF Perut", unitPrice: 350_000, unitCost: 120_000, quantity: 2 },
    { name: "Slimming Capsule", unitPrice: 5000, unitCost: 2000, quantity: 30 },
  ];

  it("nilai normal, customer hemat, total biaya, dan selisih", () => {
    expect(packageCostSummary(1_200_000, lines)).toEqual({ normalValue: 1_846_000, saving: 646_000, cost: 640_000, complete: true, margin: 560_000, missing: [] });
    expect(packagePriceError(1_200_000, packageCostSummary(1_200_000, lines))).toBeNull();
  });

  it("harga sama dengan biaya boleh; di bawah biaya ditolak (PI3)", () => {
    expect(packagePriceError(640_000, packageCostSummary(640_000, lines))).toBeNull();
    expect(packagePriceError(600_000, packageCostSummary(600_000, lines))).toBe(
      "Harga paket Rp 600.000 di bawah total biaya isi Rp 640.000. Naikkan harga paket atau kurangi isinya.",
    );
  });

  it("barang tanpa harga beli: biaya belum lengkap dan ditolak lebih dulu (PI4)", () => {
    const missing = [...lines, { name: "Serum Vitamin C", unitPrice: 185_000, unitCost: null, quantity: 1 }];
    const summary = packageCostSummary(600_000, missing);
    expect(summary).toMatchObject({ normalValue: 2_031_000, cost: 640_000, complete: false, missing: ["Serum Vitamin C"] });
    expect(packagePriceError(600_000, summary)).toBe("Harga beli Serum Vitamin C belum diisi. Isi di Stok → Barang masuk.");
  });

  it("barang tanpa harga jual dihitung Rp 0 pada nilai normal", () => {
    expect(packageCostSummary(10_000, [{ name: "Sampel", unitPrice: null, unitCost: 1000, quantity: 3 }])).toMatchObject({ normalValue: 0, saving: -10_000, cost: 3000 });
  });
});

describe("jarak kunjungan dan jumlah per kunjungan di katalog (spec jadwal paket JP2, JP16)", () => {
  const base = { name: "Lux", price: 1_000_000, validDays: 90, description: "", items: [{ serviceId: "s1", sessions: 4 }, { itemId: "i1", sessions: 28 }] };

  it("bawaan: jarak 7 hari dan barang dibagi rata dengan sesi terbanyak", () => {
    expect(validateTreatmentPackage(base)).toMatchObject({
      ok: true,
      value: { visitIntervalDays: 7, items: [{ serviceId: "s1", perVisit: null }, { itemId: "i1", perVisit: 7 }] },
    });
  });

  it("isian sendiri disimpan; di luar batas ditolak", () => {
    expect(validateTreatmentPackage({ ...base, visitIntervalDays: 14, items: [{ serviceId: "s1", sessions: 4 }, { itemId: "i1", sessions: 28, perVisit: 10 }] })).toMatchObject({
      ok: true,
      value: { visitIntervalDays: 14, items: [{ perVisit: null }, { perVisit: 10 }] },
    });
    expect(validateTreatmentPackage({ ...base, visitIntervalDays: 0 })).toEqual({ ok: false, message: "Jarak antar kunjungan 1–365 hari." });
    expect(validateTreatmentPackage({ ...base, visitIntervalDays: 366 })).toEqual({ ok: false, message: "Jarak antar kunjungan 1–365 hari." });
    expect(validateTreatmentPackage({ ...base, items: [{ itemId: "i1", sessions: 28, perVisit: 29 }] })).toEqual({ ok: false, message: "Jumlah per kunjungan 1–28." });
    expect(validateTreatmentPackage({ ...base, items: [{ itemId: "i1", sessions: 28, perVisit: 0 }] })).toEqual({ ok: false, message: "Jumlah per kunjungan 1–28." });
  });
});
