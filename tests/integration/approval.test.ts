// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPROVAL_REQUIRED, APPROVER_INVALID, PIN_WRONG } from "@/lib/approval";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireApprover, verifyApproval } from "@/server/approval";

// Pemeriksaan PIN persetujuan (spec PIN P7, P9).
const SLUGS = ["pin-keuangan", "pin-super", "pin-resepsionis", "pin-nonaktif", "pin-tanpa"];
let keuangan: string;
let superAdmin: string;
let resepsionis: string;
let nonaktif: string;
let tanpaPin: string;

async function withPin(slug: string, name: string, role: "ADMIN_KEUANGAN" | "SUPER_ADMIN" | "RESEPSIONIS", pin: string | null, isActive = true) {
  const staff = await prisma.staff.create({ data: { slug, name, role, isActive } });
  if (pin) {
    const ctx = await auth.$context;
    await prisma.approvalPin.create({ data: { staffId: staff.id, pinHash: await ctx.password.hash(pin) } });
  }
  return staff.id;
}

beforeAll(async () => {
  await prisma.staff.deleteMany({ where: { slug: { in: SLUGS } } });
  keuangan = await withPin("pin-keuangan", "Rina Keuangan", "ADMIN_KEUANGAN", "135790");
  superAdmin = await withPin("pin-super", "Super Uji", "SUPER_ADMIN", "246802");
  resepsionis = await withPin("pin-resepsionis", "Resepsionis Uji", "RESEPSIONIS", "111111");
  nonaktif = await withPin("pin-nonaktif", "Keuangan Lama", "ADMIN_KEUANGAN", "222222", false);
  tanpaPin = await withPin("pin-tanpa", "Keuangan Baru", "ADMIN_KEUANGAN", null);
});
afterAll(async () => {
  await prisma.staff.deleteMany({ where: { slug: { in: SLUGS } } });
  await prisma.$disconnect();
});

describe("verifyApproval", () => {
  it("PIN benar mengembalikan penyetuju dan menghapus hitungan salah", async () => {
    await expect(verifyApproval({ approverId: superAdmin, pin: "000000" })).rejects.toThrow(PIN_WRONG);
    expect((await prisma.approvalPin.findUniqueOrThrow({ where: { staffId: superAdmin } })).failedCount).toBe(1);
    expect(await verifyApproval({ approverId: superAdmin, pin: "246802" })).toEqual({ id: superAdmin, name: "Super Uji" });
    expect((await prisma.approvalPin.findUniqueOrThrow({ where: { staffId: superAdmin } })).failedCount).toBe(0);
  });

  it("PIN salah 5 kali mengunci 15 menit; PIN benar selama terkunci tetap ditolak dengan jamnya; setelah lewat diterima (Review Focus 3)", async () => {
    for (let attempt = 0; attempt < 4; attempt++) {
      await expect(verifyApproval({ approverId: keuangan, pin: "999999" })).rejects.toThrow(PIN_WRONG);
    }
    const before = Date.now();
    await expect(verifyApproval({ approverId: keuangan, pin: "999999" })).rejects.toThrow(/^PIN Rina Keuangan terkunci sampai \d{2}\.\d{2}\.$/);
    const locked = await prisma.approvalPin.findUniqueOrThrow({ where: { staffId: keuangan } });
    expect(locked.failedCount).toBe(0);
    expect(locked.lockedUntil!.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000 - 1_000);
    await expect(verifyApproval({ approverId: keuangan, pin: "135790" })).rejects.toThrow(/terkunci sampai/);

    await prisma.approvalPin.update({ where: { staffId: keuangan }, data: { lockedUntil: new Date(Date.now() - 1_000) } });
    expect(await verifyApproval({ approverId: keuangan, pin: "135790" })).toEqual({ id: keuangan, name: "Rina Keuangan" });
  });

  it("penyetuju nonaktif, berperan RESEPSIONIS, tanpa PIN, atau tidak dikenal ditolak APPROVER_INVALID (Review Focus 2)", async () => {
    for (const approverId of [nonaktif, resepsionis, tanpaPin, "tidak-ada"]) {
      await expect(verifyApproval({ approverId, pin: "222222" })).rejects.toThrow(APPROVER_INVALID);
    }
  });

  it("isian rusak ditolak; tanpa approval: verifyApproval null, requireApprover melempar APPROVAL_REQUIRED", async () => {
    await expect(verifyApproval({ approverId: keuangan, pin: "12" })).rejects.toThrow("PIN harus 6 angka.");
    expect(await verifyApproval(undefined)).toBeNull();
    expect(await verifyApproval(null)).toBeNull();
    expect(() => requireApprover(null)).toThrow(APPROVAL_REQUIRED);
    expect(requireApprover({ id: "x", name: "Rina" })).toEqual({ id: "x", name: "Rina" });
  });
});
