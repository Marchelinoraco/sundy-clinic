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
    ];
    for (const role of roles) {
      expect(can(role, "audit:read")).toBe(false);
    }
    expect(can("SUPER_ADMIN", "audit:read")).toBe(true);
  });

  it("menolak kemampuan yang tidak dikenal", () => {
    expect(can("SUPER_ADMIN", "tidak:ada" as Capability)).toBe(false);
  });
});
