// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { listServiceCategoryRows } from "@/server/catalog-admin-read";
import { createServiceCategory, deleteServiceCategory, moveServiceCategory, updateServiceCategory } from "@/server/service-category-admin";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Pengelola Kategori", role: "ADMIN_KEUANGAN" as Role, email: "k@uji.test" } }));
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

const PREFIX = "Kat Uji";
const SLUG = "kat-uji";
const input = (name: string, extra: Partial<{ description: string | null; selfBookable: boolean }> = {}) => ({ name, description: null, selfBookable: true, ...extra });
let online: { id: string; categoryId: string } | null = null;

async function clean() {
  await prisma.service.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.serviceCategory.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: { in: ["kategori", "kategori-2"] }, services: { none: {} } } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Pengelola Kategori" } });
}

async function orderOfMine(): Promise<string[]> {
  return (await listServiceCategoryRows()).filter((row) => row.name.startsWith(PREFIX)).map((row) => row.name);
}

beforeAll(async () => {
  await clean();
  const existing = await prisma.service.findUnique({ where: { slug: ONLINE_SERVICE_SLUG }, select: { id: true, categoryId: true } });
  online = existing;
});
beforeEach(() => {
  actor.role = "ADMIN_KEUANGAN";
});
afterAll(async () => {
  if (online) await prisma.service.update({ where: { id: online.id }, data: { categoryId: online.categoryId } });
  else await prisma.service.deleteMany({ where: { slug: ONLINE_SERVICE_SLUG } });
  await clean();
  await prisma.$disconnect();
});

describe("kelola kategori layanan (spec kategori layanan)", () => {
  it("menambah kategori di urutan terakhir dengan slug dari nama; tercatat di audit (KL3, KL4, KL5)", async () => {
    const { _max } = await prisma.serviceCategory.aggregate({ _max: { sortOrder: true } });
    const { id } = await unwrap(createServiceCategory(input(`${PREFIX} Hair & Scalp`, { description: "Perawatan rambut", selfBookable: false })));
    const row = await prisma.serviceCategory.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ slug: "kat-uji-hair-scalp", name: `${PREFIX} Hair & Scalp`, description: "Perawatan rambut", selfBookable: false, imageUrl: null });
    expect(row.sortOrder).toBe((_max.sortOrder ?? 0) + 1);
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service_category.create", entityId: id } })).summary).toBe(`${PREFIX} Hair & Scalp`);
  });

  it("nama kembar beda huruf ditolak; ganti besar-kecil huruf nama sendiri boleh (Review Focus 2)", async () => {
    const { id } = await unwrap(createServiceCategory(input(`${PREFIX} Kembar`)));
    expect(await createServiceCategory(input(`${PREFIX.toLowerCase()} KEMBAR`))).toEqual({ ok: false, error: "Kategori dengan nama ini sudah ada." });
    const other = await unwrap(createServiceCategory(input(`${PREFIX} Lain`)));
    expect(await updateServiceCategory({ id: other.id, ...input(`${PREFIX} kembar`) })).toEqual({ ok: false, error: "Kategori dengan nama ini sudah ada." });
    await unwrap(updateServiceCategory({ id, ...input(`${PREFIX} KEMBAR`) }));
    expect((await prisma.serviceCategory.findUniqueOrThrow({ where: { id } })).name).toBe(`${PREFIX} KEMBAR`);
  });

  it("nama tanpa huruf memakai slug kategori; slug terpakai diberi akhiran (Review Focus 3)", async () => {
    const symbols = await unwrap(createServiceCategory(input("✨✨")));
    expect((await prisma.serviceCategory.findUniqueOrThrow({ where: { id: symbols.id } })).slug).toBe("kategori");
    const first = await unwrap(createServiceCategory(input(`${PREFIX} Sama!`)));
    const second = await unwrap(createServiceCategory(input(`${PREFIX} Sama?`)));
    const slugs = await prisma.serviceCategory.findMany({ where: { id: { in: [first.id, second.id] } }, select: { id: true, slug: true } });
    expect(Object.fromEntries(slugs.map((row) => [row.id, row.slug]))).toEqual({ [first.id]: "kat-uji-sama", [second.id]: "kat-uji-sama-2" });
    await prisma.serviceCategory.delete({ where: { id: symbols.id } });
  });

  it("mengubah nama, deskripsi, dan sakelar tanpa mengubah slug; audit menyebut perubahan sakelar (KL5, KL12)", async () => {
    const { id } = await unwrap(createServiceCategory(input(`${PREFIX} Awal`)));
    await unwrap(updateServiceCategory({ id, ...input(`${PREFIX} Akhir`, { description: "Baru", selfBookable: false }) }));
    expect(await prisma.serviceCategory.findUniqueOrThrow({ where: { id } })).toMatchObject({
      slug: "kat-uji-awal",
      name: `${PREFIX} Akhir`,
      description: "Baru",
      selfBookable: false,
    });
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "service_category.update", entityId: id } });
    expect(audit.summary).toContain(`${PREFIX} Awal -> ${PREFIX} Akhir`);
    expect(audit.summary).toContain("pasien boleh memilih sendiri: ya → tidak");
    expect(await updateServiceCategory({ id: "tidak-ada", ...input(`${PREFIX} X`) })).toEqual({ ok: false, error: "Kategori tidak ditemukan." });
    expect(await updateServiceCategory({ id, ...input("") })).toEqual({ ok: false, error: "Isi nama kategori." });
  });

  it("naik/turun menukar posisi; ujung daftar tidak berubah; urutan kembar ditulis ulang 1..n (KL4)", async () => {
    await prisma.serviceCategory.deleteMany({ where: { name: { startsWith: PREFIX }, services: { none: {} }, siteServices: { none: {} } } });
    const a = await unwrap(createServiceCategory(input(`${PREFIX} Urut A`)));
    const b = await unwrap(createServiceCategory(input(`${PREFIX} Urut B`)));
    const c = await unwrap(createServiceCategory(input(`${PREFIX} Urut C`)));
    await prisma.serviceCategory.updateMany({ where: { id: { in: [a.id, b.id, c.id] } }, data: { sortOrder: 9000 } });

    await unwrap(moveServiceCategory({ id: c.id, direction: "up" }));
    expect(await orderOfMine()).toEqual([`${PREFIX} Urut A`, `${PREFIX} Urut C`, `${PREFIX} Urut B`]);
    const orders = (await prisma.serviceCategory.findMany({ orderBy: { sortOrder: "asc" }, select: { sortOrder: true } })).map((row) => row.sortOrder);
    expect(orders).toEqual(orders.map((_, index) => index + 1));
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service_category.move", entityId: c.id } })).summary).toBe(`${PREFIX} Urut C: naik`);

    await unwrap(moveServiceCategory({ id: b.id, direction: "down" }));
    expect(await orderOfMine()).toEqual([`${PREFIX} Urut A`, `${PREFIX} Urut C`, `${PREFIX} Urut B`]);
    const rows = await listServiceCategoryRows();
    await unwrap(moveServiceCategory({ id: rows[0].id, direction: "up" }));
    expect((await listServiceCategoryRows()).map((row) => row.id)).toEqual(rows.map((row) => row.id));
    expect(await moveServiceCategory({ id: a.id, direction: "kiri" as "up" })).toEqual({ ok: false, error: "Data tidak sah. Muat ulang halaman lalu coba lagi." });
  });

  it("hapus ditolak selama berisi layanan internal nonaktif atau layanan situs tersembunyi; kosong terhapus (KL6, Review Focus 1)", async () => {
    const { id } = await unwrap(createServiceCategory(input(`${PREFIX} Hapus`)));
    const target = await unwrap(createServiceCategory(input(`${PREFIX} Tujuan`)));
    const service = await prisma.service.create({ data: { slug: `${SLUG}-nonaktif`, name: "Layanan Nonaktif Uji", promoPrice: 50_000, categoryId: id, isActive: false } });
    const elsewhere = await prisma.service.create({ data: { slug: `${SLUG}-lain`, name: "Layanan Lain Uji", promoPrice: 50_000, categoryId: target.id } });
    await prisma.siteService.create({ data: { slug: `${SLUG}-situs`, name: "Situs Tersembunyi Uji", categoryId: id, serviceId: elsewhere.id, isActive: false } });

    expect(await deleteServiceCategory(id)).toEqual({
      ok: false,
      error: "Kategori ini masih berisi 1 layanan internal dan 1 layanan situs. Pindahkan dulu ke kategori lain lewat tombol Ubah pada layanannya.",
    });
    await prisma.service.update({ where: { id: service.id }, data: { categoryId: target.id } });
    expect(await deleteServiceCategory(id)).toMatchObject({ ok: false, error: expect.stringContaining("0 layanan internal dan 1 layanan situs") });
    await prisma.siteService.updateMany({ where: { categoryId: id }, data: { categoryId: target.id } });

    await unwrap(deleteServiceCategory(id));
    expect(await prisma.serviceCategory.findUnique({ where: { id } })).toBeNull();
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "service_category.delete", entityId: id } })).summary).toBe(`${PREFIX} Hapus`);
    expect(await deleteServiceCategory(id)).toEqual({ ok: false, error: "Kategori tidak ditemukan." });
  });

  it("kategori berisi Konsultasi Online tidak bisa dihapus (KL8)", async () => {
    const { id } = await unwrap(createServiceCategory(input(`${PREFIX} Online`)));
    if (online) await prisma.service.update({ where: { id: online.id }, data: { categoryId: id } });
    else await prisma.service.create({ data: { slug: ONLINE_SERVICE_SLUG, name: "Konsultasi Online", promoPrice: 0, categoryId: id, isActive: false } });

    expect(await deleteServiceCategory(id)).toEqual({ ok: false, error: "Kategori ini berisi Konsultasi Online dan tidak bisa dihapus." });
    const row = (await listServiceCategoryRows()).find((r) => r.id === id);
    expect(row).toMatchObject({ locked: true, serviceCount: 1, siteServiceCount: 0 });
  });

  it("listServiceCategoryRows menghitung semua isi dan menandai kategori terkunci", async () => {
    const { id } = await unwrap(createServiceCategory(input(`${PREFIX} Hitung`, { description: "Isi", selfBookable: false })));
    const inside = await prisma.service.create({ data: { slug: `${SLUG}-hitung`, name: "Layanan Hitung Uji", promoPrice: 50_000, categoryId: id, isActive: false } });
    await prisma.siteService.create({ data: { slug: `${SLUG}-hitung-situs`, name: "Situs Hitung Uji", categoryId: id, serviceId: inside.id, isActive: false } });
    const row = (await listServiceCategoryRows()).find((r) => r.id === id);
    expect(row).toEqual({ id, name: `${PREFIX} Hitung`, description: "Isi", imageUrl: null, selfBookable: false, serviceCount: 1, siteServiceCount: 1, locked: false });
  });

  it("Resepsionis tidak boleh (catalog:manage)", async () => {
    const { id } = await unwrap(createServiceCategory(input(`${PREFIX} Hak`)));
    actor.role = "RESEPSIONIS";
    await expect(createServiceCategory(input(`${PREFIX} Hak 2`))).rejects.toThrow("forbidden: catalog:manage");
    await expect(updateServiceCategory({ id, ...input(`${PREFIX} Hak 3`) })).rejects.toThrow("forbidden: catalog:manage");
    await expect(moveServiceCategory({ id, direction: "up" })).rejects.toThrow("forbidden: catalog:manage");
    await expect(deleteServiceCategory(id)).rejects.toThrow("forbidden: catalog:manage");
    await expect(listServiceCategoryRows()).rejects.toThrow("forbidden: catalog:manage");
  });
});
