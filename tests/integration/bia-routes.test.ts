// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { GET } from "@/app/(admin)/admin/bia/berkas/[id]/route";
import { POST } from "@/app/(admin)/admin/bia/unggah/route";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS" | "APOTEKER";
const { state } = vi.hoisted(() => ({
  state: { staff: null as null | { userId: string; staffId: string; name: string; role: Role; email: string } },
}));
vi.mock("@/server/session", () => ({ getCurrentStaff: vi.fn(async () => state.staff) }));

const SLUG = "rute-bia";
const WA = "6281200009104";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const as = (role: Role | null) => {
  state.staff = role ? { userId: "u", staffId: `s-${role}`, name: `Uji ${role}`, role, email: "u@uji.test" } : null;
};
const ORIGIN = "https://sundyclinic.com";

function form(appointmentId: string, bytes: Uint8Array = PNG, name = "hasil.png", type = "image/png") {
  const body = new FormData();
  body.set("appointmentId", appointmentId);
  body.set("file", new File([bytes as BlobPart], name, { type }));
  return body;
}
const post = (body: FormData | string, headers: Record<string, string> = { origin: ORIGIN, host: "sundyclinic.com" }) =>
  POST(new Request(`${ORIGIN}/admin/bia/unggah`, { method: "POST", body, headers }));
const get = (id: string, query = "") => GET(new Request(`${ORIGIN}/admin/bia/berkas/${id}${query}`), { params: Promise.resolve({ id }) });

describe("rute hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-bia-rute-"));
    process.env.PATIENT_FILES_DIR = root;
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
  });
  beforeEach(async () => {
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
    await prisma.auditLog.deleteMany({ where: { action: "bia.view" } });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("unggah: tanpa login 401, peran tanpa hak 403, asal asing atau tanpa Origin 403, bukan multipart 400", async () => {
    as(null);
    expect((await post(form(hadir))).status).toBe(401);
    as("APOTEKER");
    expect((await post(form(hadir))).status).toBe(403);
    as("RESEPSIONIS");
    expect((await post(form(hadir), { origin: "https://jahat.example", host: "sundyclinic.com" })).status).toBe(403);
    expect((await post(form(hadir), { host: "sundyclinic.com" })).status).toBe(403);
    expect((await post("bukan multipart")).status).toBe(400);
    expect(await prisma.biaFile.count()).toBe(0);
  });

  it("unggah: resepsionis berhasil; berkas palsu 422 dengan pesan Indonesia; berkas melebihi batas 413", async () => {
    as("RESEPSIONIS");
    const ok = await post(form(hadir));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, fileId: expect.any(String) });

    const fake = await post(form(hadir, new TextEncoder().encode("<script>alert(1)</script>"), "hasil.jpg", "image/jpeg"));
    expect(fake.status).toBe(422);
    expect(await fake.json()).toEqual({ ok: false, error: "Jenis berkas tidak didukung. Gunakan foto (JPG, PNG, WebP, HEIC) atau PDF." });

    const big = await post(form(hadir, new Uint8Array(10 * 1024 * 1024 + 1), "besar.png"));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ ok: false, error: "Berkas terlalu besar (maks. 10 MB)." });
    expect(await prisma.biaFile.count({ where: { measurement: { appointmentId: hadir } } })).toBe(1);
  });

  it("buka berkas: tanpa login 401, resepsionis dan apoteker 403 (walau id benar), dokter 200 dengan header aman dan audit", async () => {
    as("RESEPSIONIS");
    const { fileId } = (await (await post(form(hadir))).json()) as { fileId: string };

    as(null);
    expect((await get(fileId)).status).toBe(401);
    as("RESEPSIONIS");
    expect((await get(fileId)).status).toBe(403);
    as("APOTEKER");
    expect((await get(fileId)).status).toBe(403);

    as("DOKTER");
    const response = await get(fileId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe(`inline; filename="hasil.png"; filename*=UTF-8''hasil.png`);
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...PNG]);
    expect((await get(fileId, "?unduh=1")).headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(await prisma.auditLog.count({ where: { action: "bia.view" } })).toBe(1);
  });

  it("buka berkas: id tak dikenal 404; berkas yang dibatalkan tetap bisa dibuka dokter; berkas hilang dari disk 404", async () => {
    as("DOKTER");
    expect((await get("tidak-ada")).status).toBe(404);
    as("RESEPSIONIS");
    const { fileId } = (await (await post(form(hadir))).json()) as { fileId: string };
    await prisma.biaFile.update({ where: { id: fileId }, data: { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Buram" } });
    as("DOKTER");
    expect((await get(fileId)).status).toBe(200);
    const stored = await prisma.biaFile.findUniqueOrThrow({ where: { id: fileId } });
    await rm(path.join(root, "bia", stored.storageName));
    expect((await get(fileId)).status).toBe(404);
  });

  it("HEIC dikirim sebagai unduhan walau tanpa ?unduh=1", async () => {
    as("DOKTER");
    const heic = Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0]);
    const { fileId } = (await (await post(form(hadir, heic, "foto.heic", "image/heic"))).json()) as { fileId: string };
    const response = await get(fileId);
    expect(response.headers.get("content-type")).toBe("image/heic");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
  });
});
