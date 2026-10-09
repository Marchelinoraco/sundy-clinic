import { describe, expect, it } from "vitest";
import { isStaffRole } from "@/lib/staff-role";
import { MIN_PASSWORD_LENGTH, roleCanHaveLogin, staffChangeBlock, validateLoginEmail, validateOwnPasswordChange, validateStaffName } from "@/lib/staff-accounts";

describe("validasi nama dan email", () => {
  it("nama dipangkas, dirapikan, dan dibatasi 100 karakter", () => {
    expect(validateStaffName("  Dr.   Diane  ")).toEqual({ ok: true, value: "Dr. Diane" });
    expect(validateStaffName("   ")).toEqual({ ok: false, message: "Isi nama staf." });
    expect(validateStaffName(undefined)).toEqual({ ok: false, message: "Isi nama staf." });
    expect(validateStaffName("x".repeat(101))).toEqual({ ok: false, message: "Nama staf paling banyak 100 karakter." });
  });

  it("email dipangkas dan diubah ke huruf kecil; bentuk yang salah ditolak", () => {
    expect(validateLoginEmail("  Rina@SunDY.Test ")).toEqual({ ok: true, value: "rina@sundy.test" });
    expect(validateLoginEmail("")).toEqual({ ok: false, message: "Isi email login." });
    expect(validateLoginEmail(null)).toEqual({ ok: false, message: "Isi email login." });
    for (const bad of ["rina", "rina@", "@sundy.test", "rina@sundy", "ri na@sundy.test", "a@b@c.test"]) {
      expect(validateLoginEmail(bad)).toEqual({ ok: false, message: "Email tidak valid." });
    }
    expect(validateLoginEmail(`${"a".repeat(250)}@sundy.test`)).toEqual({ ok: false, message: "Email tidak valid." });
  });
});

describe("peran dan akun", () => {
  it("hanya Terapis yang tidak boleh punya akun", () => {
    expect(roleCanHaveLogin("TERAPIS")).toBe(false);
    for (const role of ["SUPER_ADMIN", "DOKTER", "RESEPSIONIS", "APOTEKER", "ADMIN_KEUANGAN"] as const) expect(roleCanHaveLogin(role)).toBe(true);
  });

  it("mengenali nama peran yang sah", () => {
    expect(isStaffRole("DOKTER")).toBe(true);
    expect(isStaffRole("dokter")).toBe(false);
    expect(isStaffRole("PEMILIK")).toBe(false);
    expect(isStaffRole(undefined)).toBe(false);
  });
});

describe("pengaman perubahan staf", () => {
  const target = (patch: Partial<Parameters<typeof staffChangeBlock>[0]["target"]> = {}) => ({ id: "t1", role: "RESEPSIONIS" as const, isActive: true, hasLogin: true, ...patch });
  const block = (input: Partial<Parameters<typeof staffChangeBlock>[0]> & Pick<Parameters<typeof staffChangeBlock>[0], "change">) =>
    staffChangeBlock({ actorStaffId: "aktor", target: target(), activeSuperAdminsWithLogin: 2, ...input });

  it("tidak boleh menonaktifkan diri sendiri atau menurunkan peran diri sendiri", () => {
    expect(block({ actorStaffId: "t1", change: { kind: "deactivate" } })).toBe("Anda tidak bisa menonaktifkan akun Anda sendiri.");
    expect(block({ actorStaffId: "t1", target: target({ role: "SUPER_ADMIN" }), change: { kind: "role", to: "DOKTER" } })).toBe("Anda tidak bisa menurunkan peran Anda sendiri.");
    expect(block({ actorStaffId: "t1", target: target({ role: "SUPER_ADMIN" }), change: { kind: "role", to: "SUPER_ADMIN" } })).toBeNull();
  });

  it("harus tersisa minimal satu Super Admin aktif yang punya akun", () => {
    const owner = target({ role: "SUPER_ADMIN" });
    const message = "Harus tersisa minimal satu Super Admin aktif yang punya akun.";
    expect(block({ target: owner, activeSuperAdminsWithLogin: 1, change: { kind: "deactivate" } })).toBe(message);
    expect(block({ target: owner, activeSuperAdminsWithLogin: 1, change: { kind: "role", to: "DOKTER" } })).toBe(message);
    expect(block({ target: owner, activeSuperAdminsWithLogin: 2, change: { kind: "deactivate" } })).toBeNull();
    // Super Admin tanpa akun atau yang sudah nonaktif tidak termasuk hitungan: menonaktifkannya tidak mengurangi apa pun.
    expect(block({ target: target({ role: "SUPER_ADMIN", hasLogin: false }), activeSuperAdminsWithLogin: 1, change: { kind: "deactivate" } })).toBeNull();
    expect(block({ target: target({ role: "SUPER_ADMIN", isActive: false }), activeSuperAdminsWithLogin: 1, change: { kind: "role", to: "DOKTER" } })).toBeNull();
  });

  it("staf yang punya akun tidak boleh dijadikan Terapis", () => {
    expect(block({ change: { kind: "role", to: "TERAPIS" } })).toBe("Staf yang punya akun tidak bisa berperan Terapis. Nonaktifkan akunnya atau pilih peran lain.");
    expect(block({ target: target({ hasLogin: false }), change: { kind: "role", to: "TERAPIS" } })).toBeNull();
  });
});

describe("mengganti kata sandi sendiri", () => {
  const input = (patch: Partial<Parameters<typeof validateOwnPasswordChange>[0]> = {}) => ({ currentPassword: "SementaraAbc234xyz", newPassword: "kataSandiBaruPanjang1", confirmation: "kataSandiBaruPanjang1", ...patch });

  it("menerima kata sandi baru yang cukup panjang, berbeda, dan sama dengan ulangannya", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(validateOwnPasswordChange(input())).toEqual({ ok: true, value: "kataSandiBaruPanjang1" });
  });

  it("menolak dengan pesan yang jelas", () => {
    expect(validateOwnPasswordChange(input({ currentPassword: "" }))).toEqual({ ok: false, message: "Isi kata sandi saat ini." });
    expect(validateOwnPasswordChange(input({ newPassword: "pendek", confirmation: "pendek" }))).toEqual({ ok: false, message: "Kata sandi baru minimal 12 karakter." });
    expect(validateOwnPasswordChange(input({ confirmation: "lain" }))).toEqual({ ok: false, message: "Kata sandi baru dan ulangannya tidak sama." });
    expect(validateOwnPasswordChange(input({ newPassword: "SementaraAbc234xyz", confirmation: "SementaraAbc234xyz" }))).toEqual({ ok: false, message: "Kata sandi baru harus berbeda dari yang sementara." });
    expect(validateOwnPasswordChange(input({ newPassword: "x".repeat(129), confirmation: "x".repeat(129) }))).toEqual({ ok: false, message: "Kata sandi baru paling banyak 128 karakter." });
  });
});
