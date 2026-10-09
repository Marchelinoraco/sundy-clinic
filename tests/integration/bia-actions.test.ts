// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_BIA_INPUT } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { listBiaUploads, saveBiaNumbers, startBiaMeasurement, voidBiaFile, voidBiaMeasurement } from "@/server/bia-actions";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS" | "APOTEKER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s-dokter", name: "dr. Uji", role: "DOKTER" as Role, email: "uji@sundy.test" },
}));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "aksi-bia";
const WA = "6281200009102";
const numbers = (patch: Partial<typeof EMPTY_BIA_INPUT> = {}) => ({ ...EMPTY_BIA_INPUT, bodyFatPercent: "28,5", muscleMassKg: "41", ...patch });

describe("aksi hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let selesai: string;

  const measurementFor = async (appointmentId: string) => unwrap(startBiaMeasurement(appointmentId)).then((r) => r.measurementId);
  const addFile = (measurementId: string, uploadedById = "s-resepsionis") =>
    prisma.biaFile.create({
      data: { measurementId, storageName: `2035/01/${crypto.randomUUID()}.jpg`, originalName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 10, sha256: "a".repeat(64), uploadedById, uploadedByName: "Rina" },
    });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
    selesai = (await finalVisit(world)).appointmentId;
    await prisma.appointment.update({ where: { id: selesai }, data: { status: "SELESAI" } });
  });
  beforeEach(async () => {
    actor.role = "DOKTER";
    actor.staffId = "s-dokter";
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("memulai pengukuran: dibuat sekali, panggilan kedua mengembalikan yang sama", async () => {
    const a = await measurementFor(hadir);
    const b = await measurementFor(hadir);
    expect(b).toBe(a);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir } })).toBe(1);
  });

  it("menyimpan angka: tersimpan dengan pelaku, versi naik, audit tanpa isi angka", async () => {
    const id = await measurementFor(hadir);
    const saved = await unwrap(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers({ visceralFat: "9", bmr: "1450" }), note: " Puasa " }));
    expect(saved.version).toBe(2);
    const row = await prisma.biaMeasurement.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ visceralFat: 9, bmr: 1450, note: "Puasa", numbersByName: "dr. Uji", version: 2 });
    expect(Number(row.bodyFatPercent)).toBe(28.5);
    expect(row.numbersAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "bia.numbers.save", entityId: id } });
    expect(audit.summary).not.toMatch(/28[,.]5/);
  });

  it("menolak angka tidak sah dan simpan dengan versi lama", async () => {
    const id = await measurementFor(hadir);
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers({ bodyFatPercent: "1" }), note: "" })).toEqual({ ok: false, error: "Lemak tubuh harus 2–70 %." });
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: EMPTY_BIA_INPUT, note: "" })).toEqual({ ok: false, error: "Isi minimal satu angka BIA." });
    await unwrap(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" }));
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers({ bodyFatPercent: "27" }), note: "" })).toEqual({
      ok: false,
      error: "Angka BIA baru diubah di tempat lain. Muat ulang halaman.",
    });
  });

  it("hanya peran yang boleh menulis catatan klinis yang mengisi angka", async () => {
    const id = await measurementFor(hadir);
    actor.role = "RESEPSIONIS";
    await expect(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" })).rejects.toThrow("forbidden: record:write");
    await expect(startBiaMeasurement(hadir)).rejects.toThrow("forbidden: record:write");
  });

  it("setelah SELESAI: angka yang sudah tersimpan tidak bisa diubah; pengukuran kosong boleh diisi sekali; batalkan lalu mulai yang baru", async () => {
    const id = await measurementFor(selesai);
    await unwrap(saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" }));
    const locked = await saveBiaNumbers({ measurementId: id, version: 2, numbers: numbers({ bodyFatPercent: "27" }), note: "" });
    expect(locked).toEqual({ ok: false, error: "Kunjungan sudah final. Angka yang sudah tersimpan tidak bisa diubah; batalkan pengukuran lalu isi yang baru." });
    await unwrap(voidBiaMeasurement({ measurementId: id, reason: "Salah timbang" }));
    const fresh = await measurementFor(selesai);
    expect(fresh).not.toBe(id);
    await unwrap(saveBiaNumbers({ measurementId: fresh, version: 1, numbers: numbers({ bodyFatPercent: "27" }), note: "" }));
    expect(await saveBiaNumbers({ measurementId: fresh, version: 2, numbers: numbers({ bodyFatPercent: "26" }), note: "" })).toMatchObject({ ok: false });
  });

  it("membatalkan pengukuran: alasan wajib, tidak bisa dua kali, tidak bisa disimpan lagi, berkas tetap tercatat", async () => {
    const id = await measurementFor(hadir);
    const file = await addFile(id);
    expect(await voidBiaMeasurement({ measurementId: id, reason: "  " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(voidBiaMeasurement({ measurementId: id, reason: "Pasien salah" }));
    expect(await voidBiaMeasurement({ measurementId: id, reason: "Lagi" })).toEqual({ ok: false, error: "Pengukuran ini sudah dibatalkan." });
    expect(await saveBiaNumbers({ measurementId: id, version: 1, numbers: numbers(), note: "" })).toEqual({ ok: false, error: "Pengukuran ini sudah dibatalkan." });
    expect(await prisma.biaFile.findUnique({ where: { id: file.id } })).not.toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "bia.void", entityId: id } })).toBe(1);
  });

  it("membatalkan berkas: dokter mana saja; resepsionis hanya miliknya sendiri dan hanya selama HADIR", async () => {
    const id = await measurementFor(hadir);
    const mine = await addFile(id, "s-resepsionis");
    const theirs = await addFile(id, "s-lain");
    actor.role = "RESEPSIONIS";
    actor.staffId = "s-resepsionis";
    expect(await voidBiaFile({ fileId: theirs.id, reason: "Salah" })).toEqual({ ok: false, error: "Anda hanya bisa membatalkan unggahan Anda sendiri." });
    await unwrap(voidBiaFile({ fileId: mine.id, reason: "Foto buram" }));
    expect(await voidBiaFile({ fileId: mine.id, reason: "Lagi" })).toEqual({ ok: false, error: "Berkas ini sudah dibatalkan." });
    actor.role = "DOKTER";
    actor.staffId = "s-dokter";
    await unwrap(voidBiaFile({ fileId: theirs.id, reason: "Bukan hasil pasien ini" }));
    expect(await prisma.biaFile.count({ where: { measurementId: id, voidedAt: { not: null } } })).toBe(2);

    const afterFinal = await addFile(await measurementFor(selesai), "s-resepsionis");
    actor.role = "RESEPSIONIS";
    actor.staffId = "s-resepsionis";
    expect(await voidBiaFile({ fileId: afterFinal.id, reason: "Salah" })).toMatchObject({ ok: false });
  });

  it("peran tanpa hak unggah ditolak", async () => {
    const id = await measurementFor(hadir);
    const file = await addFile(id);
    actor.role = "APOTEKER";
    await expect(voidBiaFile({ fileId: file.id, reason: "x" })).rejects.toThrow("forbidden: bia:upload");
  });

  it("daftar unggahan untuk dialog resepsionis: hanya berkas aktif, nama dan pengunggah, hak batal per berkas", async () => {
    const id = await measurementFor(hadir);
    const mine = await addFile(id, "s-resepsionis");
    await addFile(id, "s-lain");
    const voided = await addFile(id, "s-resepsionis");
    await prisma.biaFile.update({ where: { id: voided.id }, data: { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "x" } });
    actor.role = "RESEPSIONIS";
    actor.staffId = "s-resepsionis";
    const summary = await unwrap(listBiaUploads(hadir));
    expect(summary.canUpload).toBe(true);
    expect(summary.files.map((f) => [f.id === mine.id, f.canVoid])).toEqual([
      [true, true],
      [false, false],
    ]);
    expect(Object.keys(summary.files[0]).sort()).toEqual(["canVoid", "id", "originalName", "uploadedAt", "uploadedByName"]);
    actor.role = "APOTEKER";
    await expect(listBiaUploads(hadir)).rejects.toThrow("forbidden: bia:upload");
  });
});
