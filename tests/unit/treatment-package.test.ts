import { describe, expect, it } from "vitest";
import {
  packageContentsLabel,
  packageExpiresOn,
  packageOptionsFor,
  packageState,
  sessionNote,
  validateExtension,
  validateTreatmentPackage,
  type PackageOption,
} from "@/lib/treatment-package";

const valid = { name: " Facial Glow 5x ", price: 1_500_000, validDays: 180, description: "", items: [{ serviceId: "s1", sessions: 5 }] };

describe("validateTreatmentPackage", () => {
  it("merapikan isian yang sah", () => {
    expect(validateTreatmentPackage(valid)).toEqual({ ok: true, value: { name: "Facial Glow 5x", price: 1_500_000, validDays: 180, description: null, items: [{ serviceId: "s1", sessions: 5 }] } });
  });

  it("menolak isian yang tidak sah dengan pesan yang jelas", () => {
    const bad = (patch: Record<string, unknown>) => validateTreatmentPackage({ ...valid, ...patch });
    expect(bad({ name: " " })).toEqual({ ok: false, message: "Isi nama paket." });
    expect(bad({ name: "x".repeat(121) })).toEqual({ ok: false, message: "Nama paket paling banyak 120 karakter." });
    expect(bad({ price: -1 })).toEqual({ ok: false, message: "Harga paket tidak sah." });
    expect(bad({ price: 1.5 })).toEqual({ ok: false, message: "Harga paket tidak sah." });
    expect(bad({ validDays: 0 })).toEqual({ ok: false, message: "Masa berlaku 1–3650 hari." });
    expect(bad({ description: "x".repeat(501) })).toEqual({ ok: false, message: "Keterangan paling banyak 500 karakter." });
    expect(bad({ items: [] })).toEqual({ ok: false, message: "Tambahkan minimal satu treatment." });
    expect(bad({ items: [{ serviceId: "", sessions: 1 }] })).toEqual({ ok: false, message: "Pilih treatment." });
    expect(bad({ items: [{ serviceId: "s1", sessions: 0 }] })).toEqual({ ok: false, message: "Jumlah sesi 1–100." });
    expect(bad({ items: [{ serviceId: "s1", sessions: 1 }, { serviceId: "s1", sessions: 2 }] })).toEqual({ ok: false, message: "Treatment yang sama tidak boleh dua kali." });
    expect(validateTreatmentPackage(null)).toEqual({ ok: false, message: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
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
    expect(sessionNote({ packageName: "Facial Glow 5x", remaining: 3, sessions: 5 })).toBe("Sesi paket Facial Glow 5x · sisa 3 dari 5");
  });
});

describe("packageOptionsFor", () => {
  const option = (patch: Partial<PackageOption>): PackageOption => ({
    patientPackageItemId: "i1",
    patientPackageId: "p1",
    packageName: "A",
    serviceId: "s1",
    serviceName: "Facial",
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
    expect(packageOptionsFor(options, "s1", 2).map((o) => o.patientPackageItemId)).toEqual(["soon", "late"]);
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
