// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { listApprovers, resetApprovalPin, setOwnApprovalPin } from "@/server/approval-pin";
import { verifyApproval } from "@/server/approval";
import { unwrap } from "./unwrap";

type Role = "ADMIN_KEUANGAN" | "SUPER_ADMIN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "", name: "", role: "ADMIN_KEUANGAN" as Role, email: "pin@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
    requireStaff: vi.fn(async () => actor),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

// Membuat, mengganti, dan mereset PIN persetujuan (spec PIN P8, P10, P12).
const SLUGS = ["pinset-keuangan", "pinset-super", "pinset-resepsionis", "pinset-nonaktif"];
const ids: Record<string, string> = {};
const as = (slug: string, role: Role, name: string) => Object.assign(actor, { staffId: ids[slug], role, name });

beforeAll(async () => {
  await prisma.staff.deleteMany({ where: { slug: { in: SLUGS } } });
  ids["pinset-keuangan"] = (await prisma.staff.create({ data: { slug: "pinset-keuangan", name: "Rina Keuangan", role: "ADMIN_KEUANGAN" } })).id;
  ids["pinset-super"] = (await prisma.staff.create({ data: { slug: "pinset-super", name: "Ana Super", role: "SUPER_ADMIN" } })).id;
  ids["pinset-resepsionis"] = (await prisma.staff.create({ data: { slug: "pinset-resepsionis", name: "Resepsionis Pin", role: "RESEPSIONIS" } })).id;
  ids["pinset-nonaktif"] = (await prisma.staff.create({ data: { slug: "pinset-nonaktif", name: "Keuangan Nonaktif", role: "ADMIN_KEUANGAN", isActive: false } })).id;
});
beforeEach(() => as("pinset-keuangan", "ADMIN_KEUANGAN", "Rina Keuangan"));
afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: Object.values(ids) } } });
  await prisma.staff.deleteMany({ where: { slug: { in: SLUGS } } });
  await prisma.$disconnect();
});

describe("PIN persetujuan sendiri", () => {
  it("membuat PIN pertama tanpa PIN lama; mengganti wajib PIN lama yang benar", async () => {
    await unwrap(setOwnApprovalPin({ newPin: "135790" }));
    expect(await verifyApproval({ approverId: ids["pinset-keuangan"], pin: "135790" })).toMatchObject({ name: "Rina Keuangan" });
    expect(await setOwnApprovalPin({ newPin: "246802" })).toEqual({ ok: false, error: "PIN lama salah." });
    expect(await setOwnApprovalPin({ currentPin: "000000", newPin: "246802" })).toEqual({ ok: false, error: "PIN lama salah." });
    expect(await setOwnApprovalPin({ currentPin: "135790", newPin: "12" })).toEqual({ ok: false, error: "PIN harus 6 angka." });
    await unwrap(setOwnApprovalPin({ currentPin: "135790", newPin: "246802" }));
    expect(await verifyApproval({ approverId: ids["pinset-keuangan"], pin: "246802" })).toMatchObject({ name: "Rina Keuangan" });
    expect(await prisma.auditLog.count({ where: { action: "approval-pin.set", entityId: ids["pinset-keuangan"] } })).toBe(2);
  });

  it("resepsionis tidak bisa membuat PIN", async () => {
    as("pinset-resepsionis", "RESEPSIONIS", "Resepsionis Pin");
    await expect(setOwnApprovalPin({ newPin: "111111" })).rejects.toThrow(/forbidden/);
  });
});

describe("daftar penyetuju dan reset", () => {
  it("listApprovers hanya penyetuju aktif yang punya PIN, urut nama", async () => {
    as("pinset-super", "SUPER_ADMIN", "Ana Super");
    await unwrap(setOwnApprovalPin({ newPin: "975310" }));
    as("pinset-nonaktif", "ADMIN_KEUANGAN", "Keuangan Nonaktif");
    await unwrap(setOwnApprovalPin({ newPin: "864200" }));
    as("pinset-resepsionis", "RESEPSIONIS", "Resepsionis Pin");
    const approvers = (await unwrap(listApprovers())).filter((row) => Object.values(ids).includes(row.id));
    expect(approvers).toEqual([
      { id: ids["pinset-super"], name: "Ana Super" },
      { id: ids["pinset-keuangan"], name: "Rina Keuangan" },
    ]);
  });

  it("Super Admin mereset PIN; orang itu membuat PIN baru tanpa PIN lama; Admin Keuangan tidak boleh mereset", async () => {
    await expect(resetApprovalPin(ids["pinset-super"])).rejects.toThrow(/forbidden/);
    as("pinset-super", "SUPER_ADMIN", "Ana Super");
    await unwrap(resetApprovalPin(ids["pinset-keuangan"]));
    expect(await prisma.approvalPin.findUnique({ where: { staffId: ids["pinset-keuangan"] } })).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "approval-pin.reset", entityId: ids["pinset-keuangan"] } })).toBe(1);
    as("pinset-keuangan", "ADMIN_KEUANGAN", "Rina Keuangan");
    await unwrap(setOwnApprovalPin({ newPin: "112233" }));
    expect(await verifyApproval({ approverId: ids["pinset-keuangan"], pin: "112233" })).toMatchObject({ name: "Rina Keuangan" });
  });
});
