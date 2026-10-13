// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createEmployee, setEmployeeStatus, updateEmployee } from "@/server/payroll-actions";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Karyawan", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "aksi-karyawan";
const WA = "6281200009721";
let world: BillingWorld;
const base = () => ({
  name: `${SLUG} Budi`, position: "Satpam", branchId: world.branchId, joinedOn: "2026-02-01", nik: "7171010101010002", npwp: "", whatsapp: "081234567891",
  bankName: "BRI", bankAccount: "0012345678", bankHolder: "Budi", notes: "", baseSalary: 2_800_000, allowance: 200_000, staffId: null,
});

beforeAll(async () => {
  await prisma.employee.deleteMany({ where: { name: { startsWith: SLUG } } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Keuangan Karyawan" } });
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await prisma.employee.deleteMany({ where: { name: { startsWith: SLUG } } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Keuangan Karyawan" } });
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("data karyawan (spec karyawan 2.1)", () => {
  it("menambah karyawan tanpa akun; audit tanpa NIK atau rekening", async () => {
    const { id } = await unwrap(createEmployee(base()));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${SLUG} Budi`, nik: "7171010101010002", whatsapp: "6281234567891", bankAccount: "0012345678", status: "AKTIF" });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "employee.create", entityId: id } });
    expect(audit.summary).toBe(`${SLUG} Budi (Satpam): gaji Rp 2.800.000 + tunjangan Rp 200.000`);
    expect(audit.summary).not.toMatch(/7171|0012345678/);
  });

  it("menautkan staf satu-satu; staf yang sudah tertaut ditolak", async () => {
    const { id } = await unwrap(createEmployee({ ...base(), name: `${SLUG} Rina`, staffId: world.therapistId }));
    expect((await prisma.employee.findUniqueOrThrow({ where: { id } })).staffId).toBe(world.therapistId);
    expect(await createEmployee({ ...base(), name: `${SLUG} Rina Dua`, staffId: world.therapistId })).toEqual({ ok: false, error: "Staf ini sudah ditautkan ke karyawan lain." });
    expect(await createEmployee({ ...base(), name: `${SLUG} Hantu`, staffId: "tidak-ada" })).toEqual({ ok: false, error: "Staf tidak ditemukan." });
    expect(await createEmployee({ ...base(), name: `${SLUG} Hantu`, branchId: "tidak-ada" })).toEqual({ ok: false, error: "Cabang tidak ditemukan." });
  });

  it("mengubah data dan gaji; karyawan tidak ada ditolak", async () => {
    const { id } = await unwrap(createEmployee({ ...base(), name: `${SLUG} Ubah` }));
    await unwrap(updateEmployee({ id, ...base(), name: `${SLUG} Ubah Baru`, baseSalary: 3_100_000 }));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${SLUG} Ubah Baru`, baseSalary: 3_100_000 });
    expect(await updateEmployee({ id: "tidak-ada", ...base() })).toEqual({ ok: false, error: "Karyawan tidak ditemukan." });
  });

  it("berhenti wajib bertanggal keluar yang tidak sebelum tanggal masuk; bisa aktif kembali", async () => {
    const { id } = await unwrap(createEmployee({ ...base(), name: `${SLUG} Keluar` }));
    expect(await setEmployeeStatus({ id, status: "BERHENTI" })).toEqual({ ok: false, error: "Isi tanggal keluar." });
    expect(await setEmployeeStatus({ id, status: "BERHENTI", leftOn: "2026-01-15" })).toEqual({ ok: false, error: "Tanggal keluar tidak boleh sebelum tanggal masuk." });
    await unwrap(setEmployeeStatus({ id, status: "BERHENTI", leftOn: "2026-10-31" }));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "BERHENTI", leftOn: new Date("2026-10-31T00:00:00Z") });
    await unwrap(setEmployeeStatus({ id, status: "AKTIF" }));
    expect(await prisma.employee.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "AKTIF", leftOn: null });
  });

  it("hanya Super Admin dan Admin Keuangan", async () => {
    actor.role = "SUPER_ADMIN";
    await unwrap(createEmployee({ ...base(), name: `${SLUG} Pemilik` }));
    for (const role of ["RESEPSIONIS", "APOTEKER", "DOKTER"] as const) {
      actor.role = role;
      await expect(createEmployee({ ...base(), name: `${SLUG} Tolak` })).rejects.toThrow("forbidden: payroll:manage");
    }
  });
});
