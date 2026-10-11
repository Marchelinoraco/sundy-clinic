// @vitest-environment node
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/(admin)/admin/staf/foto/route";
import { GET } from "@/app/(public)/foto-dokter/[nama]/route";
import { prisma } from "@/lib/db";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { state } = vi.hoisted(() => ({ state: { staff: null as null | { userId: string; staffId: string; name: string; role: Role; email: string } } }));
vi.mock("@/server/session", () => ({ getCurrentStaff: vi.fn(async () => state.staff) }));
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "rutefoto";
const ORIGIN = "https://sundyclinic.com";
const as = (role: Role | null) => {
  state.staff = role ? { userId: "u", staffId: "s-aktor", name: "Pemilik Rute", role, email: "rute@sundy.test" } : null;
};
const png = (color = "#c8a97e", width = 800, height = 1000) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

function form(staffId: string, bytes: Uint8Array, name = "dokter.png", type = "image/png") {
  const body = new FormData();
  body.set("staffId", staffId);
  body.set("file", new File([bytes as BlobPart], name, { type }));
  return body;
}
const post = (body: FormData | string, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/staf/foto`, { method: "POST", body, headers }));
const get = (name: string) => GET(new Request(`${ORIGIN}/foto-dokter/${name}`), { params: Promise.resolve({ nama: name }) });

describe("rute foto dokter", () => {
  let root: string;
  let doctorId: string;
  const previous = process.env.PATIENT_FILES_DIR;
  const upload = async (bytes: Uint8Array) => (await (await post(form(doctorId, bytes))).json()) as { ok: boolean; photoUrl?: string; error?: string };
  const nameOf = (photoUrl: string) => photoUrl.replace("/foto-dokter/", "");

  async function clean() {
    await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await prisma.auditLog.deleteMany({ where: { actorName: "Pemilik Rute" } });
    await rm(path.join(root, "dokter"), { recursive: true, force: true });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-rutefoto-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  beforeEach(async () => {
    await clean();
    doctorId = (await prisma.staff.create({ data: { slug: `${SLUG}-dokter`, name: "Dokter Rute", role: "DOKTER", showOnWebsite: true } })).id;
  });
  afterAll(async () => {
    await clean();
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("unggah: tanpa login 401, peran selain Super Admin 403, asal asing atau tanpa Origin 403, bukan multipart 400, isian kurang 400", async () => {
    as(null);
    expect((await post(form(doctorId, await png()))).status).toBe(401);
    as("DOKTER");
    expect((await post(form(doctorId, await png()))).status).toBe(403);
    as("RESEPSIONIS");
    expect((await post(form(doctorId, await png()))).status).toBe(403);
    as("SUPER_ADMIN");
    expect((await post(form(doctorId, await png()), { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form(doctorId, await png()), { host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form(doctorId, await png()), { origin: "https://jahat.example", host: "sundyclinic.com", "x-forwarded-host": "jahat.example" })).status).toBe(403);
    expect((await post("bukan multipart")).status).toBe(400);
    const noFile = new FormData();
    noFile.set("staffId", doctorId);
    expect((await post(noFile)).status).toBe(400);
    expect(await readdir(path.join(root, "dokter")).catch(() => [])).toEqual([]);
  });

  it("unggah: Super Admin berhasil; berkas ada, photoUrl terisi, jawaban memuat alamatnya", async () => {
    as("SUPER_ADMIN");
    const response = await post(form(doctorId, await png()));
    expect(response.status).toBe(200);
    const data = (await response.json()) as { ok: boolean; photoUrl: string };
    expect(data.ok).toBe(true);
    expect(data.photoUrl).toMatch(new RegExp(`^/foto-dokter/${doctorId}-[0-9a-f]{8}\\.webp$`));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: doctorId } })).photoUrl).toBe(data.photoUrl);
    expect(await readdir(path.join(root, "dokter"))).toEqual([nameOf(data.photoUrl)]);
  });

  it("unggah: berkas palsu 422 dengan pesan Indonesia, terlalu kecil 422, peran bukan dokter 422, staf tak dikenal 422; tidak ada yang berubah", async () => {
    as("SUPER_ADMIN");
    const fake = await post(form(doctorId, new TextEncoder().encode("<script>alert(1)</script>"), "foto.jpg", "image/jpeg"));
    expect(fake.status).toBe(422);
    expect(await fake.json()).toEqual({ ok: false, error: "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP." });
    const small = await post(form(doctorId, await png("#ffffff", 500, 700)));
    expect(small.status).toBe(422);
    expect(await small.json()).toEqual({ ok: false, error: "Foto terlalu kecil. Sisi terpendek minimal 600 px." });
    const reception = await prisma.staff.create({ data: { slug: `${SLUG}-resepsionis`, name: "Resepsionis Rute", role: "RESEPSIONIS" } });
    expect(await (await post(form(reception.id, await png()))).json()).toEqual({ ok: false, error: "Foto hanya untuk dokter dan terapis." });
    expect(await (await post(form("tidak-ada", await png()))).json()).toEqual({ ok: false, error: "Staf tidak ditemukan." });
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: doctorId } })).photoUrl).toBeNull();
    expect(await readdir(path.join(root, "dokter")).catch(() => [])).toEqual([]);
  });

  it("unggah: isi yang jelas terlalu besar ditolak 413 sebelum dibaca; berkas lebih dari 8 MB juga 413", async () => {
    as("SUPER_ADMIN");
    const request = new Request(`${ORIGIN}/admin/staf/foto`, {
      method: "POST",
      body: form(doctorId, await png()),
      headers: { origin: ORIGIN, host: "sundyclinic.com", "content-length": String(20 * 1024 * 1024) },
    });
    const reading = vi.spyOn(request, "formData");
    const early = await POST(request);
    expect(early.status).toBe(413);
    expect(await early.json()).toEqual({ ok: false, error: "Foto terlalu besar (maks. 8 MB)." });
    expect(reading).not.toHaveBeenCalled();

    const big = await post(form(doctorId, new Uint8Array(8 * 1024 * 1024 + 1).fill(0xff), "besar.jpg", "image/jpeg"));
    expect(big.status).toBe(413);
  });

  it("publik: foto staf aktif yang tampil di situs disajikan tanpa login dengan header yang benar", async () => {
    as("SUPER_ADMIN");
    const { photoUrl } = await upload(await png());
    as(null);
    const response = await get(nameOf(photoUrl!));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("RIFF");
    expect(Buffer.from(bytes.slice(8, 12)).toString()).toBe("WEBP");
    expect([...bytes]).toEqual([...(await readFile(path.join(root, "dokter", nameOf(photoUrl!))))]);
  });

  it("publik: 404 untuk staf yang disembunyikan, nonaktif, atau bukan dokter/terapis; berkasnya tetap ada di disk", async () => {
    as("SUPER_ADMIN");
    const { photoUrl } = await upload(await png());
    const name = nameOf(photoUrl!);
    await prisma.staff.update({ where: { id: doctorId }, data: { showOnWebsite: false } });
    expect((await get(name)).status).toBe(404);
    await prisma.staff.update({ where: { id: doctorId }, data: { showOnWebsite: true, isActive: false } });
    expect((await get(name)).status).toBe(404);
    await prisma.staff.update({ where: { id: doctorId }, data: { isActive: true, role: "RESEPSIONIS" } });
    expect((await get(name)).status).toBe(404);
    expect(await readdir(path.join(root, "dokter"))).toEqual([name]);
    await prisma.staff.update({ where: { id: doctorId }, data: { role: "DOKTER" } });
    expect((await get(name)).status).toBe(200);
  });

  it("publik: nama berpola salah, upaya keluar folder, dan nama yang tidak terdaftar semuanya 404 tanpa menyentuh disk", async () => {
    const response404 = await get("tidak-terdaftar-0a1b2c3d.webp");
    expect(response404.status).toBe(404);
    expect(response404.headers.get("cache-control")).toBe("no-store");
    for (const bad of ["../x-0a1b2c3d.webp", "..%2F..%2Fetc%2Fpasswd", "abc.png", "ABC-0A1B2C3D.webp", "", "a/b-0a1b2c3d.webp"]) {
      expect((await get(bad)).status).toBe(404);
    }
  });
});
