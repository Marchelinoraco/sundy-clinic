// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { listStaffAccounts } from "@/server/staff";
import { setStaffExtraCapabilities } from "@/server/staff-access";

type Role = "SUPER_ADMIN" | "APOTEKER" | "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u-akses", staffId: "s-akses", name: "Pemilik Uji", role: "SUPER_ADMIN" as Role, email: "uji@sundy.test" } }));
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

const grantsOf = async (staffId: string) =>
  (await prisma.staffCapabilityGrant.findMany({ where: { staffId }, orderBy: { capability: "asc" } })).map((row) => row.capability);
const auditOf = (action: string) => prisma.auditLog.findMany({ where: { action }, orderBy: { createdAt: "asc" } });

let resepsionisId: string;

beforeEach(async () => {
  actor.role = "SUPER_ADMIN";
  await prisma.auditLog.deleteMany();
  await prisma.staff.deleteMany();
  resepsionisId = (await prisma.staff.create({ data: { slug: "resepsionis-akses", name: "Rina Resepsionis", role: "RESEPSIONIS" } })).id;
});
afterAll(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.$disconnect();
});

describe("setStaffExtraCapabilities", () => {
  it("menambah lalu mencabut akses dengan audit per perubahan", async () => {
    const first = await setStaffExtraCapabilities(resepsionisId, ["stock:receive", "stock:counter"]);
    expect(first.ok).toBe(true);
    expect(await grantsOf(resepsionisId)).toEqual(["stock:counter", "stock:receive"]);
    const added = await auditOf("staff.access.add");
    expect(added).toHaveLength(2);
    expect(added.map((row) => row.summary).sort()).toEqual([
      "Rina Resepsionis: Catat barang masuk & retur",
      "Rina Resepsionis: Isi stok meja & permintaan",
    ]);
    expect(added[0]).toMatchObject({ entity: "Staff", entityId: resepsionisId });
    expect((await prisma.staffCapabilityGrant.findFirstOrThrow({ where: { staffId: resepsionisId } })).grantedById).toBe("s-akses");

    const second = await setStaffExtraCapabilities(resepsionisId, ["stock:receive"]);
    expect(second.ok).toBe(true);
    expect(await grantsOf(resepsionisId)).toEqual(["stock:receive"]);
    const removed = await auditOf("staff.access.remove");
    expect(removed).toHaveLength(1);
    expect(removed[0].summary).toBe("Rina Resepsionis: Isi stok meja & permintaan");
  });

  it("menyimpan himpunan yang sama dua kali tidak menambah audit", async () => {
    await setStaffExtraCapabilities(resepsionisId, ["stock:receive"]);
    const before = await prisma.auditLog.count();
    const again = await setStaffExtraCapabilities(resepsionisId, ["stock:receive"]);
    expect(again.ok).toBe(true);
    expect(await prisma.auditLog.count()).toBe(before);
    expect(await grantsOf(resepsionisId)).toEqual(["stock:receive"]);
  });

  it.each(["RESEPSIONIS", "ADMIN_KEUANGAN"] as const)("menolak pemanggil %s", async (role) => {
    actor.role = role;
    await expect(setStaffExtraCapabilities(resepsionisId, ["stock:receive"])).rejects.toThrow("forbidden: staff:manage");
    expect(await grantsOf(resepsionisId)).toEqual([]);
  });

  it("menolak sasaran dan masukan yang tidak sah tanpa mengubah tabel", async () => {
    await setStaffExtraCapabilities(resepsionisId, ["stock:receive"]);
    const owner = await prisma.staff.create({ data: { slug: "pemilik-akses", name: "Pemilik", role: "SUPER_ADMIN" } });
    const cases: [string, string[], string][] = [
      [owner.id, ["stock:receive"], "Super Admin sudah memiliki semua akses."],
      ["tidak-ada", ["stock:receive"], "Staf tidak ditemukan."],
      [resepsionisId, ["staff:manage"], "Akses tidak dikenal."],
      [resepsionisId, ["approval:give"], "Akses tidak dikenal."],
      [resepsionisId, ["ngawur"], "Akses tidak dikenal."],
    ];
    for (const [id, caps, message] of cases) {
      const result = await setStaffExtraCapabilities(id, caps);
      expect(result).toMatchObject({ ok: false });
      expect(JSON.stringify(result)).toContain(message);
    }
    expect(await grantsOf(resepsionisId)).toEqual(["stock:receive"]);
    expect(await prisma.staffCapabilityGrant.count()).toBe(1);
  });

  it("mengabaikan kemampuan yang sudah dimiliki peran sasaran", async () => {
    const apoteker = await prisma.staff.create({ data: { slug: "apoteker-akses", name: "Apt Akses", role: "APOTEKER" } });
    const result = await setStaffExtraCapabilities(apoteker.id, ["stock:read"]);
    expect(result.ok).toBe(true);
    expect(await grantsOf(apoteker.id)).toEqual([]);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("staf nonaktif tetap menyimpan hibahnya", async () => {
    await setStaffExtraCapabilities(resepsionisId, ["stock:receive"]);
    await prisma.staff.update({ where: { id: resepsionisId }, data: { isActive: false } });
    expect(await grantsOf(resepsionisId)).toEqual(["stock:receive"]);
  });

  it("listStaffAccounts mengembalikan extraCapabilities", async () => {
    await setStaffExtraCapabilities(resepsionisId, ["stock:counter", "stock:receive"]);
    const rows = await listStaffAccounts();
    expect(rows.find((row) => row.id === resepsionisId)?.extraCapabilities).toEqual(["stock:counter", "stock:receive"]);
  });
});
