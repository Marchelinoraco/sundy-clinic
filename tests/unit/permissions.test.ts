import { describe, expect, it } from "vitest";
import { can, CAPABILITIES_BY_ROLE, type Capability } from "@/lib/permissions";

describe("hak akses", () => {
  it("memberi super admin seluruh kemampuan", () => {
    const all = new Set(Object.values(CAPABILITIES_BY_ROLE).flat());
    for (const capability of all) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
    }
  });

  it("melarang resepsionis membaca catatan klinis", () => {
    // Aturan paling penting di berkas ini. Resepsionis mengurus booking dan
    // data demografi, tetapi isi catatan dokter bukan haknya.
    expect(can("RESEPSIONIS", "record:read")).toBe(false);
    expect(can("RESEPSIONIS", "record:write")).toBe(false);
  });

  it("mengizinkan resepsionis mengurus booking dan jadwal", () => {
    expect(can("RESEPSIONIS", "booking:manage")).toBe(true);
    expect(can("RESEPSIONIS", "schedule:manage")).toBe(true);
  });

  it("mengizinkan dokter membaca dan menulis catatan klinis", () => {
    expect(can("DOKTER", "record:read")).toBe(true);
    expect(can("DOKTER", "record:write")).toBe(true);
  });

  it("melarang dokter mengelola akun staf", () => {
    expect(can("DOKTER", "staff:manage")).toBe(false);
  });

  it("tidak memberi terapis akses apa pun ke panel", () => {
    // Terapis ada sebagai sumber daya jadwal, bukan sebagai pengguna panel.
    expect(CAPABILITIES_BY_ROLE.TERAPIS).toEqual([]);
  });

  it("hanya memberi super admin akses jejak audit", () => {
    const roles: Array<Parameters<typeof can>[0]> = [
      "DOKTER",
      "TERAPIS",
      "RESEPSIONIS",
      "APOTEKER",
      "ADMIN_KEUANGAN",
    ];
    for (const role of roles) {
      expect(can(role, "audit:read")).toBe(false);
    }
    expect(can("SUPER_ADMIN", "audit:read")).toBe(true);
  });

  it("menolak kemampuan yang tidak dikenal", () => {
    expect(can("SUPER_ADMIN", "tidak:ada" as Capability)).toBe(false);
  });

  it("Angka dasbor (report:read) untuk Super Admin dan Admin Keuangan (spec D 4.6, spec stok 7.2)", () => {
    expect(can("SUPER_ADMIN", "report:read")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "report:read")).toBe(true);
    expect(can("DOKTER", "report:read")).toBe(false);
    expect(can("RESEPSIONIS", "report:read")).toBe(false);
    expect(can("TERAPIS", "report:read")).toBe(false);
    expect(can("APOTEKER", "report:read")).toBe(false);
  });
});

describe("hak akses stok dan hutang (spec stok 7)", () => {
  it("Apoteker mengelola stok, tetapi tidak hutang, booking, rekam medis, atau angka", () => {
    expect(can("APOTEKER", "stock:read")).toBe(true);
    expect(can("APOTEKER", "stock:manage")).toBe(true);
    for (const capability of ["payable:manage", "booking:manage", "record:read", "report:read", "staff:manage"] as const) {
      expect(can("APOTEKER", capability)).toBe(false);
    }
  });

  it("Admin Keuangan membaca stok, mengelola hutang, dan melihat Angka, tetapi tidak mengubah stok", () => {
    expect(can("ADMIN_KEUANGAN", "stock:read")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "payable:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "report:read")).toBe(true);
    for (const capability of ["stock:manage", "booking:manage", "schedule:manage", "record:read", "staff:manage"] as const) {
      expect(can("ADMIN_KEUANGAN", capability)).toBe(false);
    }
  });

  it("Dokter, Resepsionis, dan Terapis belum punya akses stok atau hutang", () => {
    for (const role of ["DOKTER", "RESEPSIONIS", "TERAPIS"] as const) {
      for (const capability of ["stock:read", "stock:manage", "payable:manage"] as const) {
        expect(can(role, capability)).toBe(false);
      }
    }
  });
});
