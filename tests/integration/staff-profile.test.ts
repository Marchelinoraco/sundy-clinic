// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UserFacingError } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { listStaffAccounts, removeStaffPhoto, updateStaff } from "@/server/staff";
import { findPublicDoctorPhoto, uploadStaffPhoto } from "@/server/staff-photo";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u-aktor", staffId: "s-aktor", name: "Pemilik Profil", role: "SUPER_ADMIN" as Role, email: "profil@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return { ...actor };
    }),
  };
});
vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));
// Pencatatan audit bisa gagal setelah foto terpasang; bendera ini membuatnya gagal sesuai kebutuhan uji.
const { auditState } = vi.hoisted(() => ({ auditState: { fail: false } }));
vi.mock("@/server/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/audit")>();
  return {
    ...real,
    recordAudit: vi.fn(async (...args: Parameters<typeof real.recordAudit>) => {
      if (auditState.fail) throw new Error("audit down");
      return real.recordAudit(...args);
    }),
  };
});

const SLUG = "profil-uji";
const png = (color = "#c8a97e", width = 800, height = 1000) => sharp({ create: { width, height, channels: 3, background: color } }).png().toBuffer();

describe("profil dokter di situs publik", () => {
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;
  const files = async () => readdir(path.join(root, "dokter")).catch(() => [] as string[]);
  const doctor = (suffix: string, patch: Record<string, unknown> = {}) =>
    prisma.staff.create({ data: { slug: `${SLUG}-${suffix}`, name: `Profil ${suffix}`, role: "DOKTER", showOnWebsite: true, ...patch } });
  const edit = (id: string, patch: Partial<Parameters<typeof updateStaff>[0]> = {}) => updateStaff({ id, name: "Profil Dokter", role: "DOKTER", showOnWebsite: true, ...patch });
  const refuse = async (promise: Promise<unknown>, message: string) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(UserFacingError);
    expect((error as UserFacingError).message).toBe(message);
  };

  async function clean() {
    await prisma.staff.deleteMany({ where: { slug: { startsWith: SLUG } } });
    await prisma.auditLog.deleteMany({ where: { actorName: "Pemilik Profil" } });
    await rm(path.join(root, "dokter"), { recursive: true, force: true });
  }

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-profil-"));
    process.env.PATIENT_FILES_DIR = root;
  });
  beforeEach(async () => {
    actor.role = "SUPER_ADMIN";
    auditState.fail = false;
    await clean();
    vi.mocked(safeRevalidatePath).mockClear();
  });
  afterAll(async () => {
    await clean();
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("updateStaff menyimpan spesialisasi dan deskripsi (dirapikan), kosong menjadi null, dan menyegarkan halaman publik", async () => {
    const staff = await doctor("a");
    await unwrap(edit(staff.id, { specialty: "  Spesialis   Gizi Klinik ", bio: "  Dokter penanggung jawab.\nRamah.  " }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ specialty: "Spesialis Gizi Klinik", bio: "Dokter penanggung jawab.\nRamah." });
    expect(safeRevalidatePath).toHaveBeenCalledWith("/tentang");
    expect(safeRevalidatePath).toHaveBeenCalledWith("/");

    await unwrap(edit(staff.id, { specialty: "   ", bio: "" }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ specialty: null, bio: null });
  });

  it("updateStaff tanpa specialty/bio tidak mengubahnya (menyimpan staf berperan lain tidak mengosongkan profil)", async () => {
    const staff = await doctor("b", { specialty: "Spesialis Gizi Klinik", bio: "Bio awal." });
    await unwrap(edit(staff.id, { name: "Nama Baru" }));
    expect(await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).toMatchObject({ name: "Nama Baru", specialty: "Spesialis Gizi Klinik", bio: "Bio awal." });
  });

  it("updateStaff menolak teks terlalu panjang dengan pesan jelas dan tidak mengubah apa pun", async () => {
    const staff = await doctor("c", { specialty: "Awal" });
    expect(await edit(staff.id, { specialty: "x".repeat(101) })).toEqual({ ok: false, error: "Spesialisasi paling banyak 100 karakter." });
    expect(await edit(staff.id, { bio: "x".repeat(601) })).toEqual({ ok: false, error: "Deskripsi paling banyak 600 karakter." });
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).specialty).toBe("Awal");
  });

  it("audit perubahan profil mencatat nama tetapi tidak isi deskripsi", async () => {
    const staff = await doctor("d");
    await unwrap(edit(staff.id, { specialty: "Spesialisasi Rahasia Uji", bio: "Isi deskripsi rahasia uji." }));
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "staff.update", entityId: staff.id } });
    expect(audit.summary).toContain("profil situs diubah");
    expect(JSON.stringify(audit)).not.toContain("Spesialisasi Rahasia Uji");
    expect(JSON.stringify(audit)).not.toContain("Isi deskripsi rahasia uji.");
  });

  it("mengunggah foto: berkas WebP ada di disk, photoUrl terisi, audit tercatat, halaman publik disegarkan", async () => {
    const staff = await doctor("e");
    const { photoUrl } = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    expect(photoUrl).toMatch(new RegExp(`^/foto-dokter/${staff.id}-[0-9a-f]{8}\\.webp$`));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBe(photoUrl);
    expect(await files()).toEqual([photoUrl.replace("/foto-dokter/", "")]);
    expect(await prisma.auditLog.count({ where: { action: "staff.photo.update", entityId: staff.id } })).toBe(1);
    expect(safeRevalidatePath).toHaveBeenCalledWith("/tentang");
    expect(safeRevalidatePath).toHaveBeenCalledWith("/");
  });

  it("mengganti foto menghapus berkas lama; mengunggah foto yang sama lagi tidak menghapus berkas yang masih dipakai", async () => {
    const staff = await doctor("f");
    const first = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#aa0000") });
    const second = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#00aa00") });
    expect(second.photoUrl).not.toBe(first.photoUrl);
    expect(await files()).toEqual([second.photoUrl.replace("/foto-dokter/", "")]);

    const again = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#00aa00") });
    expect(again.photoUrl).toBe(second.photoUrl);
    expect(await files()).toEqual([second.photoUrl.replace("/foto-dokter/", "")]);
  });

  it("menolak foto tidak sah tanpa mengubah apa pun, dan hanya untuk dokter dan terapis", async () => {
    const staff = await doctor("g", { photoUrl: null });
    await refuse(uploadStaffPhoto({ actor, staffId: staff.id, bytes: new TextEncoder().encode("<script>alert(1)</script>") }), "Jenis berkas tidak didukung. Gunakan foto JPG, PNG, atau WebP.");
    await refuse(uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#ffffff", 500, 700) }), "Foto terlalu kecil. Sisi terpendek minimal 600 px.");
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBeNull();
    expect(await files()).toEqual([]);

    const reception = await prisma.staff.create({ data: { slug: `${SLUG}-resepsionis`, name: "Profil Resepsionis", role: "RESEPSIONIS" } });
    await refuse(uploadStaffPhoto({ actor, staffId: reception.id, bytes: await png() }), "Foto hanya untuk dokter dan perawat.");
    await refuse(uploadStaffPhoto({ actor, staffId: "tidak-ada", bytes: await png() }), "Staf tidak ditemukan.");
    expect(await files()).toEqual([]);
  });

  it("bila pembaruan basis data gagal, berkas baru dihapus dan foto lama tetap utuh", async () => {
    const staff = await doctor("gagal-db");
    const first = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#aa0000") });
    await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION profil_gagal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."slug" = '${SLUG}-gagal-db' THEN RAISE EXCEPTION 'profil_gagal'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER profil_gagal BEFORE UPDATE ON "Staff" FOR EACH ROW EXECUTE FUNCTION profil_gagal()`);
    try {
      await expect(uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#00aa00") })).rejects.toThrow();
      expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBe(first.photoUrl);
      expect(await files()).toEqual([first.photoUrl.replace("/foto-dokter/", "")]);
      // Foto yang sama (nama sama dengan yang terpasang) lalu gagal: berkas yang masih dipakai tidak boleh ikut terhapus.
      // Pemicu menolak setiap UPDATE staf ini (bukan hanya yang mengubah photoUrl), jadi jalur gagal-dengan-nama-sama benar-benar terjadi.
      await expect(uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png("#aa0000") })).rejects.toThrow();
      expect(await files()).toEqual([first.photoUrl.replace("/foto-dokter/", "")]);
      expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBe(first.photoUrl);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS profil_gagal ON "Staff"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS profil_gagal()`);
    }
  });

  it("audit yang gagal setelah foto terpasang tidak membatalkan unggahan", async () => {
    const staff = await doctor("audit");
    auditState.fail = true;
    const result = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    auditState.fail = false;
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBe(result.photoUrl);
    expect(await files()).toHaveLength(1);
  });

  it("menghapus foto: photoUrl kosong, berkas terhapus, audit tercatat; tanpa foto unggahan ditolak", async () => {
    const staff = await doctor("h");
    expect(await removeStaffPhoto(staff.id)).toEqual({ ok: false, error: "Staf ini belum punya foto unggahan." });
    await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    await unwrap(removeStaffPhoto(staff.id));
    expect((await prisma.staff.findUniqueOrThrow({ where: { id: staff.id } })).photoUrl).toBeNull();
    expect(await files()).toEqual([]);
    expect(await prisma.auditLog.count({ where: { action: "staff.photo.remove", entityId: staff.id } })).toBe(1);
    expect(await removeStaffPhoto("tidak-ada")).toEqual({ ok: false, error: "Staf tidak ditemukan." });
  });

  it("daftar staf memuat spesialisasi, deskripsi, dan photoUrl", async () => {
    const staff = await doctor("i", { specialty: "Spesialis Uji", bio: "Bio uji." });
    const { photoUrl } = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    const row = (await listStaffAccounts()).find((r) => r.id === staff.id);
    expect(row).toMatchObject({ specialty: "Spesialis Uji", bio: "Bio uji.", photoUrl });
  });

  it("foto publik hanya ditemukan untuk staf aktif yang tampil di situs", async () => {
    const staff = await doctor("j");
    const { photoUrl } = await uploadStaffPhoto({ actor, staffId: staff.id, bytes: await png() });
    const name = photoUrl.replace("/foto-dokter/", "");
    expect((await findPublicDoctorPhoto(name))?.length).toBeGreaterThan(0);
    await prisma.staff.update({ where: { id: staff.id }, data: { showOnWebsite: false } });
    expect(await findPublicDoctorPhoto(name)).toBeNull();
    await prisma.staff.update({ where: { id: staff.id }, data: { showOnWebsite: true, isActive: false } });
    expect(await findPublicDoctorPhoto(name)).toBeNull();
    await prisma.staff.update({ where: { id: staff.id }, data: { isActive: true, role: "RESEPSIONIS" } });
    expect(await findPublicDoctorPhoto(name)).toBeNull();
    await prisma.staff.update({ where: { id: staff.id }, data: { role: "DOKTER" } });
    expect(await findPublicDoctorPhoto(name)).not.toBeNull();
    for (const bad of ["../x-0a1b2c3d.webp", "tidak-ada-0a1b2c3d.webp", "abc.png", ""]) expect(await findPublicDoctorPhoto(bad)).toBeNull();
  });

  it("semua aksi hanya untuk Super Admin", async () => {
    actor.role = "DOKTER";
    await expect(updateStaff({ id: "a", name: "X", role: "DOKTER", showOnWebsite: false, specialty: "x" })).rejects.toThrow("forbidden: staff:manage");
    await expect(removeStaffPhoto("a")).rejects.toThrow("forbidden: staff:manage");
  });
});
