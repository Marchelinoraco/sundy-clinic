// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getServiceBySlug } from "@/server/catalog";
import { createSiteService, setSiteServiceActive, updateSiteService } from "@/server/site-service-admin";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Pemilik Situs", role: "SUPER_ADMIN" as Role, email: "u@uji.test" } }));
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

const SLUG = "aksi-situs";
let categoryId: string;
let serviceId: string;
const base = () => ({ serviceId, name: "Masker Glow Situs", slug: `${SLUG}-masker`, categoryId, description: "Masker wajah.", priceNote: null, isSignature: false, sortOrder: 1 });

async function clean() {
  await prisma.service.deleteMany({ where: { slug: { startsWith: SLUG } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
  await prisma.auditLog.deleteMany({ where: { actorName: "Pemilik Situs" } });
}

beforeAll(async () => {
  await clean();
  categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Situs", sortOrder: 96 } })).id;
  serviceId = (await prisma.service.create({ data: { slug: `${SLUG}-internal`, name: "Masker Internal Situs", promoPrice: 80_000, durationMin: 30, categoryId } })).id;
});
beforeEach(() => {
  actor.role = "SUPER_ADMIN";
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("aksi layanan situs (spec layanan situs 5.2)", () => {
  it("membuat layanan situs yang langsung tampil dengan harga layanan internal; tercatat di audit", async () => {
    const { id } = await unwrap(createSiteService(base()));
    expect(await getServiceBySlug(`${SLUG}-masker`)).toMatchObject({ id, name: "Masker Glow Situs", promoPrice: 80_000, description: "Masker wajah." });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "site_service.create", entityId: id } })).summary).toBe(`Masker Glow Situs (/layanan/${SLUG}-masker)`);
  });

  it("slug bentrok ditolak dengan pesan, bukan galat (Review Focus 4)", async () => {
    expect(await createSiteService({ ...base(), name: "Masker Lain" })).toEqual({ ok: false, error: "Alamat (slug) sudah dipakai layanan situs lain." });
    const other = await unwrap(createSiteService({ ...base(), name: "Masker Lain", slug: `${SLUG}-lain` }));
    expect(await updateSiteService({ id: other.id, ...base(), name: "Masker Lain" })).toEqual({ ok: false, error: "Alamat (slug) sudah dipakai layanan situs lain." });
  });

  it("mengubah slug memindahkan halaman; audit menyebut alamat lama dan baru", async () => {
    const { id } = await unwrap(createSiteService({ ...base(), name: "Masker Pindah", slug: `${SLUG}-pindah` }));
    await unwrap(updateSiteService({ id, ...base(), name: "Masker Pindah", slug: `${SLUG}-pindah-baru` }));
    expect(await getServiceBySlug(`${SLUG}-pindah`)).toBeNull();
    expect((await getServiceBySlug(`${SLUG}-pindah-baru`))?.name).toBe("Masker Pindah");
    expect((await prisma.auditLog.findFirstOrThrow({ where: { action: "site_service.update", entityId: id } })).summary).toBe(
      `Masker Pindah: /layanan/${SLUG}-pindah -> /layanan/${SLUG}-pindah-baru`,
    );
    expect(await updateSiteService({ id: "tidak-ada", ...base(), slug: `${SLUG}-x` })).toEqual({ ok: false, error: "Layanan situs tidak ditemukan." });
  });

  it("menolak tautan ke Konsultasi Online, layanan yang tidak ada, atau kategori yang tidak ada", async () => {
    const online = await prisma.service.findUnique({ where: { slug: "konsultasi-online" } });
    if (online) expect(await createSiteService({ ...base(), slug: `${SLUG}-online`, serviceId: online.id })).toEqual({ ok: false, error: "Pilih layanan internal yang sah." });
    expect(await createSiteService({ ...base(), slug: `${SLUG}-hantu`, serviceId: "tidak-ada" })).toEqual({ ok: false, error: "Pilih layanan internal yang sah." });
    expect(await createSiteService({ ...base(), slug: `${SLUG}-kat`, categoryId: "tidak-ada" })).toEqual({ ok: false, error: "Pilih kategori." });
  });

  it("menonaktifkan menyembunyikan dari situs; Admin Keuangan boleh, Resepsionis dan Apoteker tidak", async () => {
    const { id } = await unwrap(createSiteService({ ...base(), name: "Masker Status", slug: `${SLUG}-status` }));
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(setSiteServiceActive({ id, active: false }));
    expect(await getServiceBySlug(`${SLUG}-status`)).toBeNull();
    await unwrap(setSiteServiceActive({ id, active: true }));
    expect(await getServiceBySlug(`${SLUG}-status`)).not.toBeNull();
    for (const role of ["RESEPSIONIS", "APOTEKER"] as const) {
      actor.role = role;
      await expect(setSiteServiceActive({ id, active: false })).rejects.toThrow("forbidden: catalog:manage");
      await expect(createSiteService({ ...base(), slug: `${SLUG}-tolak` })).rejects.toThrow("forbidden: catalog:manage");
    }
  });
});
