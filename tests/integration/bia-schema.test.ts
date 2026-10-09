// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

const SLUG = "skema-bia";
const WA = "6281200009100";

describe("skema hasil BIA", () => {
  let world: BillingWorld;
  let hadir: string;
  let selesai: string;

  const measurement = (data: Record<string, unknown> = {}, appointmentId = hadir) =>
    prisma.biaMeasurement.create({
      data: { appointmentId, patientId: world.patientId, createdById: "s1", createdByName: "Uji", ...data },
    });
  const file = (measurementId: string, data: Record<string, unknown> = {}) =>
    prisma.biaFile.create({
      data: {
        measurementId,
        storageName: `2035/01/${crypto.randomUUID()}.jpg`,
        originalName: "bia.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
        sha256: "a".repeat(64),
        uploadedById: "s1",
        uploadedByName: "Uji",
        ...data,
      },
    });
  const clear = async () => {
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
  };

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    hadir = (await finalVisit(world)).appointmentId;
    selesai = (await finalVisit(world)).appointmentId;
    // Finalisasi sungguhan memindahkan booking HADIR → SELESAI dalam transaksi yang sama.
    await prisma.appointment.update({ where: { id: selesai }, data: { status: "SELESAI" } });
  });
  beforeEach(clear);
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("setiap angka dijaga rentangnya di basis data", async () => {
    await expect(measurement({ bodyFatPercent: 1.9 })).rejects.toThrow(/bia_body_fat_range/);
    await expect(measurement({ bodyFatPercent: 70.1 })).rejects.toThrow(/bia_body_fat_range/);
    await expect(measurement({ muscleMassKg: 4.9 })).rejects.toThrow(/bia_muscle_range/);
    await expect(measurement({ visceralFat: 0 })).rejects.toThrow(/bia_visceral_range/);
    await expect(measurement({ visceralFat: 60 })).rejects.toThrow(/bia_visceral_range/);
    await expect(measurement({ bmr: 499 })).rejects.toThrow(/bia_bmr_range/);
    await expect(measurement({ metabolicAge: 4 })).rejects.toThrow(/bia_metabolic_age_range/);
    await expect(measurement({ bodyWaterPercent: 19.9 })).rejects.toThrow(/bia_water_range/);
    await expect(measurement({ boneMassKg: 0.4 })).rejects.toThrow(/bia_bone_range/);
    const ok = await measurement({ bodyFatPercent: 28.5, muscleMassKg: 41, visceralFat: 9, bmr: 1450, metabolicAge: 38, bodyWaterPercent: 47.5, boneMassKg: 2.6 });
    expect(Number(ok.bodyFatPercent)).toBe(28.5);
  });

  it("satu booking hanya boleh punya satu pengukuran aktif; yang dibatalkan tidak menghalangi", async () => {
    const first = await measurement();
    await expect(measurement()).rejects.toThrow(/BiaMeasurement_one_active_per_appointment|Unique constraint/);
    await prisma.biaMeasurement.update({
      where: { id: first.id },
      data: { voidedAt: new Date(), voidedById: "s1", voidedByName: "Uji", voidReason: "Salah timbang" },
    });
    expect((await measurement()).voidedAt).toBeNull();
  });

  it("data pembatalan harus lengkap atau kosong semuanya", async () => {
    await expect(measurement({ voidedAt: new Date() })).rejects.toThrow(/bia_void_fields/);
    await expect(measurement({ voidedAt: new Date(), voidedByName: "x" })).rejects.toThrow(/bia_void_fields/);
    const m = await measurement({ voidedAt: new Date(), voidedById: "s1", voidedByName: "Uji", voidReason: "Salah" });
    await expect(file(m.id, { voidedAt: new Date() })).rejects.toThrow(/bia_file_void_fields/);
  });

  it("ukuran berkas harus lebih dari 0 dan paling besar 10 MB", async () => {
    const m = await measurement();
    await expect(file(m.id, { sizeBytes: 0 })).rejects.toThrow(/bia_file_size/);
    await expect(file(m.id, { sizeBytes: 10 * 1024 * 1024 + 1 })).rejects.toThrow(/bia_file_size/);
    expect((await file(m.id, { sizeBytes: 10 * 1024 * 1024 })).sizeBytes).toBe(10 * 1024 * 1024);
  });

  it("angka yang sudah tersimpan terkunci setelah booking SELESAI; yang belum pernah diisi boleh diisi satu kali", async () => {
    const filled = await measurement({ bodyFatPercent: 30, numbersAt: new Date(), numbersById: "s1", numbersByName: "Uji" }, selesai);
    await expect(prisma.biaMeasurement.update({ where: { id: filled.id }, data: { bodyFatPercent: 25 } })).rejects.toThrow(/bia_terkunci/);
    await expect(prisma.biaMeasurement.update({ where: { id: filled.id }, data: { note: "Ubah" } })).rejects.toThrow(/bia_terkunci/);
    // Pembatalan tetap boleh.
    await prisma.biaMeasurement.update({ where: { id: filled.id }, data: { voidedAt: new Date(), voidedById: "s1", voidedByName: "Uji", voidReason: "Koreksi" } });

    const empty = await measurement({}, selesai);
    const first = await prisma.biaMeasurement.update({
      where: { id: empty.id },
      data: { bodyFatPercent: 27, numbersAt: new Date(), numbersById: "s1", numbersByName: "Uji" },
    });
    expect(Number(first.bodyFatPercent)).toBe(27);
    await expect(prisma.biaMeasurement.update({ where: { id: empty.id }, data: { bodyFatPercent: 26 } })).rejects.toThrow(/bia_terkunci/);
  });

  it("selama booking HADIR angka boleh diubah", async () => {
    const m = await measurement({ bodyFatPercent: 30, numbersAt: new Date(), numbersById: "s1", numbersByName: "Uji" });
    const updated = await prisma.biaMeasurement.update({ where: { id: m.id }, data: { bodyFatPercent: 29, version: { increment: 1 } } });
    expect(Number(updated.bodyFatPercent)).toBe(29);
  });
});
