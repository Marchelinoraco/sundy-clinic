// @vitest-environment node
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { UserFacingError } from "@/lib/action-result";
import { BIA_MAX_BYTES } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { uploadBiaFile } from "@/server/bia-upload";

import type { CurrentStaff } from "@/server/session";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

// Pencatatan audit bisa gagal setelah transaksi berhasil (mis. sambungan putus sesaat).
const { audit } = vi.hoisted(() => ({ audit: { fail: false } }));
vi.mock("@/server/audit", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/audit")>();
  return {
    ...real,
    recordAudit: vi.fn(async (...args: Parameters<typeof real.recordAudit>) => {
      if (audit.fail) throw new Error("audit down");
      return real.recordAudit(...args);
    }),
  };
});

const SLUG = "unggah-bia";
const WA = "6281200009101";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0]);

const staff = (role: CurrentStaff["role"], staffId = "s-" + role): CurrentStaff => ({ userId: "u-" + role, staffId, name: `Uji ${role}`, role, email: `${role}@uji.test` });
const resepsionis = staff("RESEPSIONIS");
const dokter = staff("DOKTER");

describe("layanan unggah hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let selesai: string;
  let root: string;
  const previous = process.env.PATIENT_FILES_DIR;

  const upload = (actor: CurrentStaff, appointmentId = hadir, bytes: Uint8Array = JPEG, originalName = "hasil.jpg") =>
    uploadBiaFile({ actor, appointmentId, originalName, bytes });
  const filesOnDisk = async () => {
    try {
      const years = await readdir(path.join(root, "bia"));
      const all: string[] = [];
      for (const year of years) for (const month of await readdir(path.join(root, "bia", year))) all.push(...(await readdir(path.join(root, "bia", year, month))));
      return all;
    } catch {
      return [];
    }
  };
  const refuse = async (promise: Promise<unknown>, message: string | RegExp) => {
    const error = await promise.then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(UserFacingError);
    expect((error as UserFacingError).message).toMatch(message);
  };

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sundy-bia-int-"));
    process.env.PATIENT_FILES_DIR = root;
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
    selesai = (await finalVisit(world)).appointmentId;
    await prisma.appointment.update({ where: { id: selesai }, data: { status: "SELESAI" } });
  });
  beforeEach(async () => {
    audit.fail = false;
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
    await rm(path.join(root, "bia"), { recursive: true, force: true });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    if (previous === undefined) delete process.env.PATIENT_FILES_DIR;
    else process.env.PATIENT_FILES_DIR = previous;
    await rm(root, { recursive: true, force: true });
    await prisma.$disconnect();
  });

  it("resepsionis mengunggah ke booking HADIR: pengukuran dibuat, berkas tercatat lengkap, ada di disk, dan terekam di audit", async () => {
    const { fileId, measurementId } = await upload(resepsionis, hadir, JPEG, "C:\\Users\\Rina\\hasil bia.jpg");
    const row = await prisma.biaFile.findUniqueOrThrow({ where: { id: fileId }, include: { measurement: true } });
    expect(row).toMatchObject({ measurementId, originalName: "hasil bia.jpg", mimeType: "image/jpeg", sizeBytes: JPEG.length, uploadedByName: "Uji RESEPSIONIS", voidedAt: null });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.storageName).toMatch(/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.jpg$/);
    expect(row.measurement).toMatchObject({ appointmentId: hadir, patientId: world.patientId, createdByName: "Uji RESEPSIONIS", numbersAt: null });
    expect(await filesOnDisk()).toHaveLength(1);
    const audit = await prisma.auditLog.findFirstOrThrow({ where: { action: "bia.upload", entityId: measurementId } });
    expect(audit.summary).toContain("hasil bia.jpg");
  });

  it("berkas berikutnya masuk ke pengukuran aktif yang sama", async () => {
    const first = await upload(resepsionis);
    const second = await upload(dokter);
    expect(second.measurementId).toBe(first.measurementId);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir } })).toBe(1);
  });

  it("menolak berkas ke-6, dan berkas yang sudah tertulis di disk dihapus (tidak ada yatim)", async () => {
    for (let i = 0; i < 5; i += 1) await upload(dokter);
    await refuse(upload(dokter), /paling banyak 5 berkas/);
    expect(await prisma.biaFile.count({ where: { measurement: { appointmentId: hadir } } })).toBe(5);
    expect(await filesOnDisk()).toHaveLength(5);
  });

  it("berkas yang dibatalkan tidak dihitung dalam batas 5", async () => {
    const files = [];
    for (let i = 0; i < 5; i += 1) files.push(await upload(dokter));
    await prisma.biaFile.update({ where: { id: files[0].fileId }, data: { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Salah foto" } });
    await expect(upload(dokter)).resolves.toBeTruthy();
  });

  it("unggahan serentak: tetap satu pengukuran aktif dan paling banyak 5 berkas", async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => upload(dokter)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir, voidedAt: null } })).toBe(1);
    expect(await prisma.biaFile.count({ where: { measurement: { appointmentId: hadir }, voidedAt: null } })).toBe(5);
    expect(await filesOnDisk()).toHaveLength(5);
  });

  it("menolak berkas kosong, terlalu besar, dan berjenis tidak dikenal (isi HTML berekstensi .jpg)", async () => {
    await refuse(upload(dokter, hadir, new Uint8Array(0)), /Berkas kosong/);
    await refuse(upload(dokter, hadir, new Uint8Array(BIA_MAX_BYTES + 1).fill(0xff)), /terlalu besar \(maks\. 10 MB\)/);
    const html = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");
    await refuse(upload(dokter, hadir, html, "hasil.jpg"), /Jenis berkas tidak didukung/);
    expect(await filesOnDisk()).toHaveLength(0);
    expect(await prisma.biaMeasurement.count({ where: { appointmentId: hadir } })).toBe(0);
  });

  it("audit yang gagal setelah pencatatan tidak menghapus berkas: berkas tetap di disk, barisnya ada, dan unggahan berhasil", async () => {
    audit.fail = true;
    const { fileId } = await upload(dokter);
    audit.fail = false;
    expect(await prisma.biaFile.count({ where: { id: fileId } })).toBe(1);
    expect(await filesOnDisk()).toHaveLength(1);
  });

  it("unggah yang bersamaan dengan finalisasi: status dibaca ulang di dalam transaksi, resepsionis ditolak bila kunjungan baru saja final", async () => {
    // Booking tersendiri: setelah SELESAI ia tidak bisa dikembalikan ke HADIR (pemicu kunci kunjungan final).
    const { appointmentId: racer } = await finalVisit(world);
    let locked: () => void = () => undefined;
    const lockHeld = new Promise<void>((resolve) => (locked = resolve));
    const finalizing = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Appointment" WHERE "id" = ${racer} FOR UPDATE`;
        await tx.appointment.update({ where: { id: racer }, data: { status: "SELESAI" } });
        locked();
        await new Promise((resolve) => setTimeout(resolve, 700));
      },
      { timeout: 10_000 },
    );
    await lockHeld;
    // Pemeriksaan awal tanpa kunci masih melihat HADIR; transaksi unggah harus menunggu dan melihat SELESAI.
    const racing = upload(resepsionis, racer).then(() => null, (e: unknown) => e);
    await finalizing;
    const error = await racing;
    expect(error).toBeInstanceOf(UserFacingError);
    expect((error as UserFacingError).message).toMatch(/sudah final/);
    expect(await filesOnDisk()).toHaveLength(0);
  });

  it("unggah yang bersamaan dengan pembatalan pengukuran: berkas masuk ke pengukuran baru, bukan yang baru dibatalkan", async () => {
    const first = await upload(dokter);
    let locked: () => void = () => undefined;
    const lockHeld = new Promise<void>((resolve) => (locked = resolve));
    const voiding = prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "BiaMeasurement" WHERE "id" = ${first.measurementId} FOR UPDATE`;
        await tx.biaMeasurement.update({
          where: { id: first.measurementId },
          data: { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Salah" },
        });
        locked();
        await new Promise((resolve) => setTimeout(resolve, 700));
      },
      { timeout: 10_000 },
    );
    await lockHeld;
    const racing = upload(dokter);
    await voiding;
    const second = await racing;
    expect(second.measurementId).not.toBe(first.measurementId);
    expect((await prisma.biaMeasurement.findUniqueOrThrow({ where: { id: second.measurementId } })).voidedAt).toBeNull();
  });

  it("menolak booking tak dikenal, booking online, status belum check-in, dan peran tanpa hak", async () => {
    await refuse(upload(dokter, "tidak-ada"), /Booking tidak ditemukan/);
    const waiting = await prisma.appointment.findUniqueOrThrow({ where: { id: hadir } });
    const other = await prisma.appointment.create({
      data: { ...pick(waiting), code: `BIA-${SLUG.toUpperCase()}-X1`, status: "TERKONFIRMASI", startAt: new Date("2031-02-01T01:00:00Z"), endAt: new Date("2031-02-01T01:30:00Z") },
    });
    await refuse(upload(dokter, other.id), /setelah pasien check-in/);
    const online = await prisma.appointment.create({
      data: { ...pick(waiting), code: `BIA-${SLUG.toUpperCase()}-X2`, channel: "ONLINE", servicePrice: 250000, status: "HADIR", startAt: new Date("2031-02-02T01:00:00Z"), endAt: new Date("2031-02-02T01:30:00Z") },
    });
    await refuse(upload(dokter, online.id), /tidak ditimbang/);
    await refuse(upload(staff("APOTEKER"), hadir), /tidak bisa mengunggah/);
    await prisma.appointment.deleteMany({ where: { id: { in: [other.id, online.id] } } });
  });

  it("setelah kunjungan SELESAI: dokter boleh menambah ke pengukuran yang angkanya belum tersimpan, resepsionis tidak", async () => {
    await refuse(upload(resepsionis, selesai), /sudah final/);
    const { measurementId } = await upload(dokter, selesai);
    await prisma.biaMeasurement.update({ where: { id: measurementId }, data: { bodyFatPercent: 30, numbersAt: new Date(), numbersById: "s", numbersByName: "dr. Uji" } });
    await refuse(upload(dokter, selesai), /Batalkan pengukuran lalu tambah yang baru/);
    expect(await filesOnDisk()).toHaveLength(1);
  });
});

function pick(a: { type: unknown; servicePrice: unknown; source: unknown; branchId: string; staffId: string; serviceId: string | null; patientId: string | null }) {
  return { type: a.type as "KONSULTASI", source: a.source as "WALK_IN", branchId: a.branchId, staffId: a.staffId, serviceId: a.serviceId, patientId: a.patientId };
}
