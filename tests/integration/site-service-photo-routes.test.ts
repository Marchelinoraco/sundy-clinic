// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/(admin)/admin/layanan/foto/route";
import { GET as adminPreview } from "@/app/(admin)/admin/layanan/foto/[nama]/route";
import { GET } from "@/app/(public)/foto-layanan/[nama]/route";
import { prisma } from "@/lib/db";
import { removeSiteServicePhoto } from "@/server/site-service-admin";

type Role = "SUPER_ADMIN" | "ADMIN_KEUANGAN" | "RESEPSIONIS";
const { state } = vi.hoisted(() => ({ state: { staff: null as null | { userId: string; staffId: string; name: string; role: Role; email: string } } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    getCurrentStaff: vi.fn(async () => state.staff),
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!state.staff || !can(state.staff.role, capability)) throw new Error(`forbidden: ${capability}`);
      return state.staff;
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "foto-situs";
const ORIGIN = "https://sundyclinic.com";
const as = (role: Role | null) => {
  state.staff = role ? { userId: "u", staffId: "s-foto", name: "Pengelola Foto", role, email: "foto@sundy.test" } : null;
};
const png = () => sharp({ create: { width: 900, height: 700, channels: 3, background: "#c8a97e" } }).png().toBuffer();

function form(siteServiceId: string, bytes: Uint8Array) {
  const body = new FormData();
  body.set("siteServiceId", siteServiceId);
  body.set("file", new File([bytes as BlobPart], "layanan.png", { type: "image/png" }));
  return body;
}
const post = (body: FormData, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/layanan/foto`, { method: "POST", body, headers }));
const get = (name: string) => GET(new Request(`${ORIGIN}/foto-layanan/${name}`), { params: Promise.resolve({ nama: name }) });
const preview = (name: string) => adminPreview(new Request(`${ORIGIN}/admin/layanan/foto/${name}`), { params: Promise.resolve({ nama: name }) });

describe("foto layanan situs (spec layanan situs 5.3)", () => {
  let root: string;
  let siteId: string;
  let serviceId: string;
  const previous = process.env.PATIENT_FILES_DIR;

  async function clean() {
    await prisma.service.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
    await prisma.auditLog.deleteMany({ where: { actorName: "Pengelola Foto" } });
    await rm(path.join(root, "layanan"), { recursive: true, force: true });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-foto-layanan-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  beforeEach(async () => {
    await clean();
    const categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Foto", sortOrder: 95 } })).id;
    serviceId = (await prisma.service.create({ data: { slug: `${SLUG}-internal`, name: "Foto Internal Uji", promoPrice: 10_000, categoryId } })).id;
    siteId = (await prisma.siteService.create({ data: { slug: `${SLUG}-situs`, name: "Foto Situs Uji", categoryId, serviceId } })).id;
  });
  afterAll(async () => {
    await clean();
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("unggah: tanpa login 401, Resepsionis 403, asal asing 403; Admin Keuangan berhasil dan foto lama dihapus", async () => {
    as(null);
    expect((await post(form(siteId, await png()))).status).toBe(401);
    as("RESEPSIONIS");
    expect((await post(form(siteId, await png()))).status).toBe(403);
    as("ADMIN_KEUANGAN");
    expect((await post(form(siteId, await png()), { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form("tidak-ada", await png()))).status).toBe(422);

    const first = (await (await post(form(siteId, await png()))).json()) as { ok: boolean; photoUrl: string };
    expect(first.photoUrl).toMatch(/^\/foto-layanan\/[0-9a-z]+-[0-9a-f]{8}\.webp$/);
    expect((await prisma.siteService.findUniqueOrThrow({ where: { id: siteId } })).imageUrl).toBe(first.photoUrl);
    const other = await sharp({ create: { width: 900, height: 700, channels: 3, background: "#204060" } }).png().toBuffer();
    const second = (await (await post(form(siteId, other))).json()) as { ok: boolean; photoUrl: string };
    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect(await readdir(path.join(root, "layanan"))).toEqual([second.photoUrl.replace("/foto-layanan/", "")]);
    expect(await prisma.auditLog.count({ where: { action: "site_service.photo", entityId: siteId } })).toBe(2);
  });

  it("rute publik hanya untuk layanan situs aktif dengan layanan internal aktif (Review Focus 5); pratinjau admin tanpa syarat aktif", async () => {
    as("SUPER_ADMIN");
    const { photoUrl } = (await (await post(form(siteId, await png()))).json()) as { photoUrl: string };
    const name = photoUrl.replace("/foto-layanan/", "");

    const ok = await get(name);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toBe("public, max-age=300");

    await prisma.service.update({ where: { id: serviceId }, data: { isActive: false } });
    expect((await get(name)).status).toBe(404);
    await prisma.service.update({ where: { id: serviceId }, data: { isActive: true } });
    await prisma.siteService.update({ where: { id: siteId }, data: { isActive: false } });
    expect((await get(name)).status).toBe(404);
    expect((await preview(name)).status).toBe(200);
    expect((await get("../rahasia.webp")).status).toBe(404);

    as("RESEPSIONIS");
    expect((await preview(name)).status).toBe(403);
  });

  it("hapus foto: berkas dan alamatnya hilang; tanpa foto unggahan ditolak", async () => {
    as("SUPER_ADMIN");
    await post(form(siteId, await png()));
    expect(await removeSiteServicePhoto(siteId)).toEqual({ ok: true, data: undefined });
    expect((await prisma.siteService.findUniqueOrThrow({ where: { id: siteId } })).imageUrl).toBeNull();
    expect(await readdir(path.join(root, "layanan"))).toEqual([]);
    expect(await removeSiteServicePhoto(siteId)).toEqual({ ok: false, error: "Layanan situs ini belum punya foto unggahan." });
  });
});
