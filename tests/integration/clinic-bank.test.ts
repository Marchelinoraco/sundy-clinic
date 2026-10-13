// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import {
  createClinicBankAccount,
  listActiveClinicBankAccounts,
  listClinicBankAccounts,
  moveClinicBankAccount,
  setClinicBankAccountActive,
  updateClinicBankAccount,
} from "@/server/clinic-bank";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Pemilik", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const MARK = "Bank Uji Rek";
const cleanup = () => prisma.clinicBankAccount.deleteMany({ where: { bankName: { startsWith: MARK } } });

beforeEach(async () => {
  actor.role = "SUPER_ADMIN";
  await cleanup();
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("rekening klinik", () => {
  it("tambah, ubah, nonaktifkan, urutkan; audit tercatat", async () => {
    const a = (await unwrap(createClinicBankAccount({ bankName: `${MARK} A`, accountNumber: "1111111", accountHolder: "SunDY" }))).id;
    const b = (await unwrap(createClinicBankAccount({ bankName: `${MARK} B`, accountNumber: "2222222", accountHolder: "SunDY" }))).id;
    await unwrap(updateClinicBankAccount(a, { bankName: `${MARK} A`, accountNumber: "1111112", accountHolder: "SunDY Clinic" }));
    await unwrap(moveClinicBankAccount(b, "UP"));
    const mine = (await listClinicBankAccounts()).filter((x) => x.bankName.startsWith(MARK));
    expect(mine.map((x) => x.id)).toEqual([b, a]);
    expect(mine[1]).toMatchObject({ accountNumber: "1111112", label: `${MARK} A 1111112 a.n. SunDY Clinic` });
    await unwrap(setClinicBankAccountActive(a, false));
    expect((await listActiveClinicBankAccounts()).some((x) => x.id === a)).toBe(false);
    expect(await prisma.auditLog.count({ where: { entityId: a, action: { startsWith: "clinic-bank." } } })).toBe(3);
  });

  it("bank + nomor kembar di antara rekening aktif ditolak", async () => {
    await unwrap(createClinicBankAccount({ bankName: `${MARK} C`, accountNumber: "3333333", accountHolder: "SunDY" }));
    expect(await createClinicBankAccount({ bankName: `${MARK} C`, accountNumber: "333-3333", accountHolder: "Lain" })).toEqual({
      ok: false,
      error: "Rekening ini sudah ada.",
    });
  });

  it("hanya content:manage mengelola; invoice:read melihat yang aktif", async () => {
    actor.role = "RESEPSIONIS";
    await expect(createClinicBankAccount({ bankName: `${MARK} D`, accountNumber: "44444", accountHolder: "x" })).rejects.toThrow("forbidden: content:manage");
    expect(Array.isArray(await listActiveClinicBankAccounts())).toBe(true);
  });
});
