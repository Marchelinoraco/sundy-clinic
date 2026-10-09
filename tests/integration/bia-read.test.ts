// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { getBiaForVisit, getBiaHistory } from "@/server/bia-read";
import { cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "DOKTER" | "RESEPSIONIS";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u1", staffId: "s-dokter", name: "dr. Uji", role: "DOKTER" as Role, email: "uji@sundy.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

const SLUG = "baca-bia";
const WA = "6281200009103";

describe("pembacaan hasil BIA", () => {
  let world: BillingWorld;
  let first: string;
  let second: string;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    first = (await finalVisit(world)).appointmentId;
    second = (await finalVisit(world)).appointmentId;
  });
  beforeEach(async () => {
    actor.role = "DOKTER";
    await prisma.biaFile.deleteMany({ where: { measurement: { patientId: world.patientId } } });
    await prisma.biaMeasurement.deleteMany({ where: { patientId: world.patientId } });
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  const create = (appointmentId: string, data: Record<string, unknown> = {}) =>
    prisma.biaMeasurement.create({ data: { appointmentId, patientId: world.patientId, createdById: "s1", createdByName: "Uji", ...data } });

  it("kunjungan tanpa pengukuran: kosong, hak tetap dihitung dari peran dan status", async () => {
    const view = await getBiaForVisit(first);
    expect(view.active).toBeNull();
    expect(view.voided).toEqual([]);
    expect(view.access).toMatchObject({ upload: true, editNumbers: true, view: true });
    expect(view.final).toBe(false);
  });

  it("memuat pengukuran aktif dengan angka sebagai bilangan, berkas aktif dan dibatalkan, serta yang dibatalkan terpisah", async () => {
    const old = await create(first, { voidedAt: new Date("2031-01-01T00:00:00Z"), voidedById: "s", voidedByName: "Uji", voidReason: "Salah" });
    const active = await create(first, { bodyFatPercent: 28.5, muscleMassKg: 41, bmr: 1450, numbersAt: new Date(), numbersById: "s1", numbersByName: "dr. Uji" });
    await prisma.biaFile.create({
      data: { measurementId: active.id, storageName: `2035/01/${crypto.randomUUID()}.pdf`, originalName: "a.pdf", mimeType: "application/pdf", sizeBytes: 5, sha256: "b".repeat(64), uploadedById: "s", uploadedByName: "Rina" },
    });
    await prisma.biaFile.create({
      data: { measurementId: active.id, storageName: `2035/01/${crypto.randomUUID()}.heic`, originalName: "b.heic", mimeType: "image/heic", sizeBytes: 5, sha256: "c".repeat(64), uploadedById: "s", uploadedByName: "Rina", voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Buram" },
    });
    const view = await getBiaForVisit(first);
    expect(view.active).toMatchObject({ id: active.id, version: 1, numbers: { bodyFatPercent: 28.5, muscleMassKg: 41, bmr: 1450, visceralFat: null }, numbersByName: "dr. Uji" });
    expect(view.active?.files.map((f) => [f.originalName, f.previewable, f.voided?.reason ?? null])).toEqual([
      ["a.pdf", true, null],
      ["b.heic", false, "Buram"],
    ]);
    expect(view.voided.map((m) => m.id)).toEqual([old.id]);
  });

  it("riwayat pasien: titik grafik berurutan menurut waktu hanya dari pengukuran aktif yang punya angka, dan daftar berisi semuanya", async () => {
    await create(first, { bodyFatPercent: 32, muscleMassKg: 40, numbersAt: new Date(), numbersById: "s", numbersByName: "x", createdAt: new Date("2031-03-01T03:00:00Z") });
    await create(second, { bodyFatPercent: 30, muscleMassKg: 41.5, numbersAt: new Date(), numbersById: "s", numbersByName: "x", createdAt: new Date("2031-04-01T03:00:00Z") });
    await create(second, { voidedAt: new Date(), voidedById: "s", voidedByName: "Uji", voidReason: "Dobel", createdAt: new Date("2031-04-02T03:00:00Z") }).catch(() => undefined);
    const history = await getBiaHistory(world.patientId);
    expect(history.points.map((p) => [p.bodyFatPercent, p.muscleMassKg])).toEqual([[32, 40], [30, 41.5]]);
    expect(history.points[0].at.getTime()).toBeLessThan(history.points[1].at.getTime());
    expect(history.items.length).toBeGreaterThanOrEqual(2);
  });

  it("grafik dan riwayat memakai tanggal kunjungan, bukan waktu pengukuran dibuat: pengukuran koreksi tidak mengubah urutan", async () => {
    const visits = await prisma.appointment.findMany({ where: { id: { in: [first, second] } }, select: { id: true, startAt: true } });
    const startOf = (id: string) => visits.find((v) => v.id === id)!.startAt;
    expect(startOf(first).getTime()).toBeLessThan(startOf(second).getTime());
    // Kunjungan pertama diukur ulang (koreksi) belakangan, setelah kunjungan kedua.
    await create(second, { bodyFatPercent: 30, muscleMassKg: 41, numbersAt: new Date(), numbersById: "s", numbersByName: "x", createdAt: new Date("2031-04-01T03:00:00Z") });
    await create(first, { bodyFatPercent: 32, muscleMassKg: 40, numbersAt: new Date(), numbersById: "s", numbersByName: "x", createdAt: new Date("2031-04-20T03:00:00Z") });

    const history = await getBiaHistory(world.patientId);
    expect(history.points.map((p) => [p.bodyFatPercent, p.at.getTime()])).toEqual([
      [32, startOf(first).getTime()],
      [30, startOf(second).getTime()],
    ]);
    expect(history.items.map((m) => m.visitAt.getTime())).toEqual([startOf(second).getTime(), startOf(first).getTime()]);
    const visit = await getBiaForVisit(second);
    expect(visit.points.map((p) => p.bodyFatPercent)).toEqual([32, 30]);
  });

  it("resepsionis tidak boleh membaca", async () => {
    actor.role = "RESEPSIONIS";
    await expect(getBiaForVisit(first)).rejects.toThrow("forbidden: record:read");
    await expect(getBiaHistory(world.patientId)).rejects.toThrow("forbidden: record:read");
  });
});
