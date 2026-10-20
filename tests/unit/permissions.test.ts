import { describe, expect, it } from "vitest";
import { isNavItemVisible, NAV_GROUPS } from "@/components/admin/app-sidebar";
import { can, CAPABILITIES_BY_ROLE, type Capability } from "@/lib/permissions";

describe("hak akses", () => {
  it("memberi super admin seluruh kemampuan, kecuali bunyi check-in milik perawat", () => {
    const all = new Set(Object.values(CAPABILITIES_BY_ROLE).flat());
    all.delete("checkin:notify");
    for (const capability of all) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
    }
  });

  it("stok meja: resepsionis melihat dan meminta, Apoteker melihat dan mengelola (spec stok meja 7)", () => {
    expect(can("RESEPSIONIS", "counter:read")).toBe(true);
    expect(can("RESEPSIONIS", "restock:request")).toBe(true);
    expect(can("RESEPSIONIS", "stock:manage")).toBe(false);
    expect(can("APOTEKER", "counter:read")).toBe(true);
    expect(can("APOTEKER", "restock:request")).toBe(false);
    expect(can("ADMIN_KEUANGAN", "counter:read")).toBe(false);
    expect(can("DOKTER", "counter:read")).toBe(false);
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

  it("Perawat (TERAPIS): kerja perawat, pemberitahuan check-in, unggah BIA — tanpa rekam medis", () => {
    expect(CAPABILITIES_BY_ROLE.TERAPIS).toEqual(["nurse:work", "checkin:notify", "bia:upload"]);
    expect(can("TERAPIS", "record:read")).toBe(false);
    expect(can("SUPER_ADMIN", "nurse:work")).toBe(true);
    expect(can("SUPER_ADMIN", "checkin:notify")).toBe(false);
    expect(can("DOKTER", "nurse:work")).toBe(false);
  });

  it("menu Perawat hanya Dasbor", () => {
    const visible = NAV_GROUPS.flatMap((g) => g.items).filter((item) => isNavItemVisible("TERAPIS", item)).map((i) => i.title);
    expect(visible).toEqual(["Dasbor"]);
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

describe("hak akses tagihan (spec tagihan 6)", () => {
  it("Resepsionis menagih tetapi tidak mengoreksi", () => {
    expect(can("RESEPSIONIS", "invoice:read")).toBe(true);
    expect(can("RESEPSIONIS", "invoice:manage")).toBe(true);
    expect(can("RESEPSIONIS", "invoice:correct")).toBe(false);
  });

  it("Admin Keuangan melihat dan mengoreksi tetapi tidak membuat tagihan", () => {
    expect(can("ADMIN_KEUANGAN", "invoice:read")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "invoice:correct")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "invoice:manage")).toBe(false);
  });

  it("Dokter, Apoteker, dan Terapis tidak mengakses tagihan; Super Admin semuanya", () => {
    for (const role of ["DOKTER", "APOTEKER", "TERAPIS"] as const) {
      for (const capability of ["invoice:read", "invoice:manage", "invoice:correct"] as const) {
        expect(can(role, capability)).toBe(false);
      }
    }
    for (const capability of ["invoice:read", "invoice:manage", "invoice:correct"] as const) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
    }
  });
});

describe("hak akses penyerahan obat (spec penyerahan 5)", () => {
  it("Apoteker menyerahkan obat dan melihat stok; tidak membaca catatan klinis", () => {
    for (const capability of ["dispense:read", "dispense:manage", "stock:availability"] as const) {
      expect(can("APOTEKER", capability)).toBe(true);
    }
    expect(can("APOTEKER", "record:read")).toBe(false);
  });

  it("Dokter hanya melihat ketersediaan stok", () => {
    expect(can("DOKTER", "stock:availability")).toBe(true);
    expect(can("DOKTER", "dispense:read")).toBe(false);
    expect(can("DOKTER", "dispense:manage")).toBe(false);
    expect(can("DOKTER", "stock:read")).toBe(false);
  });

  it("Resepsionis, Admin Keuangan, dan Terapis tidak punya akses; Super Admin semuanya", () => {
    for (const role of ["RESEPSIONIS", "ADMIN_KEUANGAN", "TERAPIS"] as const) {
      for (const capability of ["dispense:read", "dispense:manage", "stock:availability"] as const) {
        expect(can(role, capability)).toBe(false);
      }
    }
    for (const capability of ["dispense:read", "dispense:manage", "stock:availability"] as const) {
      expect(can("SUPER_ADMIN", capability)).toBe(true);
    }
  });
});

describe("hak akses pengeluaran dan laporan (spec laporan 6)", () => {
  it("Admin Keuangan dan Super Admin mencatat pengeluaran dan melihat laporan", () => {
    for (const role of ["ADMIN_KEUANGAN", "SUPER_ADMIN"] as const) {
      expect(can(role, "expense:manage")).toBe(true);
      expect(can(role, "profit:read")).toBe(true);
    }
  });

  it("Dokter, Apoteker, Resepsionis, dan Terapis tidak punya akses", () => {
    for (const role of ["DOKTER", "APOTEKER", "RESEPSIONIS", "TERAPIS"] as const) {
      expect(can(role, "expense:manage")).toBe(false);
      expect(can(role, "profit:read")).toBe(false);
    }
  });
});

describe("hak akses hasil BIA (spec hasil BIA 5)", () => {
  it("Super Admin, Dokter, Resepsionis, dan Perawat boleh mengunggah; peran lain tidak", () => {
    for (const role of ["SUPER_ADMIN", "DOKTER", "RESEPSIONIS", "TERAPIS"] as const) expect(can(role, "bia:upload")).toBe(true);
    for (const role of ["APOTEKER", "ADMIN_KEUANGAN"] as const) expect(can(role, "bia:upload")).toBe(false);
  });

  it("Resepsionis tetap tidak membaca rekam medis", () => {
    expect(can("RESEPSIONIS", "record:read")).toBe(false);
  });

  it("harga jual dan promo barang hanya Super Admin dan Admin Keuangan", () => {
    expect(can("SUPER_ADMIN", "price:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "price:manage")).toBe(true);
    for (const role of ["APOTEKER", "RESEPSIONIS", "DOKTER", "TERAPIS"] as const) expect(can(role, "price:manage")).toBe(false);
  });

  it("katalog layanan dikelola Super Admin dan Admin Keuangan (spec layanan situs 5)", () => {
    expect(can("SUPER_ADMIN", "catalog:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "catalog:manage")).toBe(true);
    for (const role of ["RESEPSIONIS", "APOTEKER", "DOKTER", "TERAPIS"] as const) {
      expect(can(role, "catalog:manage")).toBe(false);
    }
  });

  it("penggajian hanya untuk Super Admin dan Admin Keuangan (spec karyawan 6)", () => {
    expect(can("SUPER_ADMIN", "payroll:manage")).toBe(true);
    expect(can("ADMIN_KEUANGAN", "payroll:manage")).toBe(true);
    for (const role of ["RESEPSIONIS", "APOTEKER", "DOKTER", "TERAPIS"] as const) expect(can(role, "payroll:manage")).toBe(false);
  });
});
