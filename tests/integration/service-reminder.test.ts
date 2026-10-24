// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { setServiceReturnReminder } from "@/server/service-admin";
import { unwrap } from "./unwrap";

type Role = "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Jarak", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
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

// Jarak pengingat per layanan (spec pengingat treatment PT2, PT3).
const SLUG = "jarak-pengingat";
let serviceId: string;

async function cleanup() {
  await prisma.service.deleteMany({ where: { slug: SLUG } });
  await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Keuangan Jarak" } });
}

beforeAll(async () => {
  await cleanup();
  const category = await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Jarak", sortOrder: 96 } });
  serviceId = (await prisma.service.create({ data: { slug: SLUG, name: "Facial Jarak", promoPrice: 100_000, categoryId: category.id } })).id;
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("jarak pengingat layanan", () => {
  it("layanan baru tidak diingatkan (PT3)", async () => {
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).returnReminderDays).toBeNull();
  });

  it("Admin Keuangan mengatur jarak; nilai di luar pilihan ditolak; Resepsionis tidak boleh (PT2, PT3)", async () => {
    await unwrap(setServiceReturnReminder({ serviceId, days: 14 }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).returnReminderDays).toBe(14);
    expect(await prisma.auditLog.count({ where: { action: "service.reminder", entityId: serviceId } })).toBe(1);

    await unwrap(setServiceReturnReminder({ serviceId, days: null }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: serviceId } })).returnReminderDays).toBeNull();

    expect(await setServiceReturnReminder({ serviceId, days: 10 })).toEqual({ ok: false, error: "Pilih jarak pengingat." });
    expect(await setServiceReturnReminder({ serviceId: "tidak-ada", days: 7 })).toEqual({ ok: false, error: "Layanan tidak ditemukan." });

    actor.role = "RESEPSIONIS";
    await expect(setServiceReturnReminder({ serviceId, days: 7 })).rejects.toThrow(/forbidden: catalog:manage/);
  });

  it("basis data menolak jarak di luar pilihan", async () => {
    await expect(prisma.service.update({ where: { id: serviceId }, data: { returnReminderDays: 5 } })).rejects.toThrow();
  });
});
