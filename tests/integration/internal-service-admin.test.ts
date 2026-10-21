// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInternalService, setServiceActive, updateInternalService } from "@/server/service-admin";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Keuangan Katalog", role: "ADMIN_KEUANGAN" as Role, email: "u@uji.test" } }));
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

const SLUG = "aksi-internal";
const NAME = "Uji Aksi Internal";
let categoryId: string;
const base = () => ({ name: `${NAME} Masker`, categoryId, promoPrice: 75_000, normalPrice: null, durationMin: 30, requiresDoctor: false });

async function clean() {
  await prisma.service.deleteMany({ where: { name: { startsWith: NAME } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Keuangan Katalog" } });
}

beforeAll(async () => {
  await clean();
  categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Aksi", sortOrder: 97 } })).id;
  // Uji lain (schema.test) mengosongkan katalog; Konsultasi Dokter disiapkan sendiri seperti dunia uji booking.
  const slimming = await prisma.serviceCategory.upsert({ where: { slug: "slimming" }, update: {}, create: { slug: "slimming", name: "Slimming & Wellness" } });
  await prisma.service.upsert({
    where: { slug: "konsultasi-dokter" },
    update: { isActive: true, requiresDoctor: true, durationMin: 30 },
    create: { slug: "konsultasi-dokter", name: "Konsultasi Dokter", promoPrice: 200000, durationMin: 30, requiresDoctor: true, categoryId: slimming.id },
  });
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("aksi layanan internal (spec layanan situs 5.1)", () => {
  it("Admin Keuangan menambah layanan khusus internal dengan slug otomatis; tercatat di audit; tidak tampil di situs", async () => {
    const { id } = await unwrap(createInternalService(base()));
    const created = await prisma.service.findUniqueOrThrow({ where: { id }, include: { siteServices: true } });
    expect(created).toMatchObject({ name: `${NAME} Masker`, slug: "uji-aksi-internal-masker", promoPrice: 75_000, durationMin: 30, isActive: true, categoryId });
    expect(created.siteServices).toEqual([]);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service.create", entityId: id } })).summary).toBe(`${NAME} Masker: Rp 75.000, 30 menit`);

    // Nama kembar (tanpa membedakan huruf) ditolak; slug berikutnya diberi akhiran.
    expect(await createInternalService({ ...base(), name: `${NAME.toUpperCase()} MASKER` })).toEqual({ ok: false, error: "Nama layanan sudah dipakai layanan lain." });
    const second = await unwrap(createInternalService({ ...base(), name: `${NAME} Masker!` }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id: second.id } })).slug).toBe("uji-aksi-internal-masker-2");
  });

  it("mengubah nama, kategori, harga, durasi, dan perlu dokter", async () => {
    const { id } = await unwrap(createInternalService({ ...base(), name: `${NAME} Ubah` }));
    await unwrap(updateInternalService({ id, ...base(), name: `${NAME} Ubah Baru`, promoPrice: 90_000, normalPrice: 120_000, durationMin: 45, requiresDoctor: true }));
    expect(await prisma.service.findUniqueOrThrow({ where: { id } })).toMatchObject({ name: `${NAME} Ubah Baru`, slug: "uji-aksi-internal-ubah", promoPrice: 90_000, normalPrice: 120_000, durationMin: 45, requiresDoctor: true });
    expect(await updateInternalService({ id, ...base(), durationMin: 50 })).toEqual({ ok: false, error: "Durasi 15–480 menit, kelipatan 15." });
    expect(await updateInternalService({ id: "tidak-ada", ...base() })).toEqual({ ok: false, error: "Layanan tidak ditemukan." });
  });

  it("Konsultasi Dokter: durasi hanya 15/30/45/60 dan tidak bisa dinonaktifkan; Konsultasi Online tidak diubah lewat aksi ini (Review Focus 3)", async () => {
    const consultation = await prisma.service.findUniqueOrThrow({ where: { slug: "konsultasi-dokter" } });
    const input = { id: consultation.id, name: consultation.name, categoryId: consultation.categoryId, promoPrice: consultation.promoPrice, normalPrice: consultation.normalPrice, durationMin: 90, requiresDoctor: true };
    expect(await updateInternalService(input)).toEqual({ ok: false, error: "Durasi Konsultasi Dokter harus 15, 30, 45, atau 60 menit." });
    expect(await setServiceActive({ id: consultation.id, active: false })).toEqual({ ok: false, error: "Konsultasi Dokter tidak bisa dinonaktifkan." });
    expect(await updateInternalService({ ...input, durationMin: 30, requiresDoctor: false })).toEqual({ ok: false, error: "Konsultasi Dokter selalu ditangani dokter." });

    const online = await prisma.service.findUnique({ where: { slug: "konsultasi-online" } });
    if (online) {
      expect(await updateInternalService({ ...input, id: online.id, durationMin: 30 })).toEqual({ ok: false, error: "Layanan tidak ditemukan." });
      expect(await setServiceActive({ id: online.id, active: true })).toEqual({ ok: false, error: "Layanan tidak ditemukan." });
    }
  });

  it("harga lewat Ubah tidak boleh turun di bawah biaya; ganti nama saja tetap boleh pada layanan yang terlanjur rugi (BL5, BL13)", async () => {
    const { id } = await unwrap(createInternalService({ ...base(), name: `${NAME} Biaya` }));
    await prisma.service.update({ where: { id }, data: { materialCost: 60_000 } });
    expect(await updateInternalService({ id, ...base(), name: `${NAME} Biaya`, promoPrice: 50_000 })).toEqual({
      ok: false,
      error: "Harga berlaku Rp 50.000 di bawah total biaya per sesi Rp 60.000. Naikkan harga atau kurangi biaya lewat tombol Harga & biaya.",
    });
    await prisma.service.update({ where: { id }, data: { materialCost: 100_000 } });
    await unwrap(updateInternalService({ id, ...base(), name: `${NAME} Biaya Ganti` }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id } })).name).toBe(`${NAME} Biaya Ganti`);
  });

  it("menonaktifkan dan mengaktifkan; tercatat di audit", async () => {
    const { id } = await unwrap(createInternalService({ ...base(), name: `${NAME} Status` }));
    await unwrap(setServiceActive({ id, active: false }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id } })).isActive).toBe(false);
    await unwrap(setServiceActive({ id, active: true }));
    expect((await prisma.service.findUniqueOrThrow({ where: { id } })).isActive).toBe(true);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: { in: ["service.deactivate", "service.activate"] } } })).toBe(2);
  });

  it("Super Admin boleh; Resepsionis dan Apoteker ditolak", async () => {
    actor.role = "SUPER_ADMIN";
    await unwrap(createInternalService({ ...base(), name: `${NAME} Pemilik` }));
    for (const role of ["RESEPSIONIS", "APOTEKER"] as const) {
      actor.role = role;
      await expect(createInternalService({ ...base(), name: `${NAME} Ditolak` })).rejects.toThrow("forbidden: catalog:manage");
      await expect(setServiceActive({ id: "x", active: false })).rejects.toThrow("forbidden: catalog:manage");
    }
  });
});
