// @vitest-environment node
import { access, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/(admin)/admin/layanan/foto-kategori/route";
import { GET } from "@/app/(public)/foto-kategori/[nama]/route";
import { prisma } from "@/lib/db";
import { deleteServiceCategory, removeServiceCategoryPhoto } from "@/server/service-category-admin";

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

const SLUG = "foto-kategori-uji";
const ORIGIN = "https://sundyclinic.com";
const PHOTO = /^\/foto-kategori\/[0-9a-z]+-[0-9a-f]{8}\.webp$/;
const as = (role: Role | null) => {
  state.staff = role ? { userId: "u", staffId: "s-foto-kat", name: "Pengelola Foto Kategori", role, email: "fotokat@sundy.test" } : null;
};
const png = (background = "#c8a97e") => sharp({ create: { width: 900, height: 700, channels: 3, background } }).png().toBuffer();

function form(categoryId: string, bytes: Uint8Array, name = "kategori.png") {
  const body = new FormData();
  body.set("categoryId", categoryId);
  body.set("file", new File([bytes as BlobPart], name, { type: "image/png" }));
  return body;
}
const post = (body: FormData, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/layanan/foto-kategori`, { method: "POST", body, headers }));
const get = (name: string) => GET(new Request(`${ORIGIN}/foto-kategori/${name}`), { params: Promise.resolve({ nama: name }) });
const upload = async (categoryId: string, background?: string) => (await (await post(form(categoryId, await png(background)))).json()) as { ok: boolean; photoUrl: string };
const fileName = (url: string) => url.replace("/foto-kategori/", "");

describe("foto kategori (spec kategori layanan KL9)", () => {
  let root: string;
  let categoryId: string;
  const previous = process.env.PATIENT_FILES_DIR;

  async function clean() {
    await prisma.serviceCategory.deleteMany({ where: { slug: SLUG } });
    await prisma.auditLog.deleteMany({ where: { actorName: "Pengelola Foto Kategori" } });
    await rm(path.join(root, "kategori"), { recursive: true, force: true });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-foto-kategori-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  beforeEach(async () => {
    await clean();
    categoryId = (await prisma.serviceCategory.create({ data: { slug: SLUG, name: "Kategori Foto Uji", sortOrder: 94 } })).id;
  });
  afterAll(async () => {
    await clean();
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("unggah menyimpan WebP di folder kategori, mengganti yang lama, dan tampil di rute publik", async () => {
    as("ADMIN_KEUANGAN");
    const first = await upload(categoryId);
    expect(first.photoUrl).toMatch(PHOTO);
    expect((await prisma.serviceCategory.findUniqueOrThrow({ where: { id: categoryId } })).imageUrl).toBe(first.photoUrl);

    const second = await upload(categoryId, "#204060");
    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect(await readdir(path.join(root, "kategori"))).toEqual([fileName(second.photoUrl)]);
    expect(await prisma.auditLog.count({ where: { action: "service_category.photo", entityId: categoryId } })).toBe(2);

    const ok = await get(fileName(second.photoUrl));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/webp");
    expect(ok.headers.get("cache-control")).toBe("public, max-age=300");
    expect((await get(fileName(first.photoUrl))).status).toBe(404);
    expect((await get("../rahasia.webp")).status).toBe(404);
  });

  it("hapus foto dan hapus kategori membuang berkasnya; rute publik 404 (Review Focus 5)", async () => {
    as("SUPER_ADMIN");
    const { photoUrl } = await upload(categoryId);
    expect(await removeServiceCategoryPhoto(categoryId)).toEqual({ ok: true, data: undefined });
    expect((await prisma.serviceCategory.findUniqueOrThrow({ where: { id: categoryId } })).imageUrl).toBeNull();
    expect(await readdir(path.join(root, "kategori"))).toEqual([]);
    expect((await get(fileName(photoUrl))).status).toBe(404);
    expect(await removeServiceCategoryPhoto(categoryId)).toEqual({ ok: false, error: "Kategori ini belum punya foto unggahan." });

    const again = await upload(categoryId);
    await expect(access(path.join(root, "kategori", fileName(again.photoUrl)))).resolves.toBeUndefined();
    expect(await deleteServiceCategory(categoryId)).toEqual({ ok: true, data: undefined });
    expect(await readdir(path.join(root, "kategori"))).toEqual([]);
    expect((await get(fileName(again.photoUrl))).status).toBe(404);
  });

  it("Resepsionis 403; tanpa login 401; beda asal 403; berkas > 8 MB 413; kategori tidak ada 422", async () => {
    as(null);
    expect((await post(form(categoryId, await png()))).status).toBe(401);
    as("RESEPSIONIS");
    expect((await post(form(categoryId, await png()))).status).toBe(403);
    await expect(removeServiceCategoryPhoto(categoryId)).rejects.toThrow("forbidden: catalog:manage");
    as("ADMIN_KEUANGAN");
    expect((await post(form(categoryId, await png()), { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form(categoryId, new Uint8Array(8 * 1024 * 1024 + 1)))).status).toBe(413);
    expect((await post(form("tidak-ada", await png()))).status).toBe(422);
  });
});
