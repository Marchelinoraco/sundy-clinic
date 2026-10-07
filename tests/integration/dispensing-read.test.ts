// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { countPendingDispensings, getDispensingDetail, listDispenseItems, listDispensings } from "@/server/dispensing-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Apoteker Uji", role: "APOTEKER" as Role, email: "uji@sundy.test" },
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

const SLUG = "baca-penyerahan";
const WA = "6281200008902";
const today = witaDateString(new Date());

describe("membaca penyerahan", () => {
  let world: BillingWorld;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });
  beforeEach(() => {
    actor.role = "APOTEKER";
  });
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("antrean per tampilan, dengan pencarian nama pasien; hitungan Menunggu", async () => {
    const waitingVisit = await finalVisit(world, { pharmacyNote: "Obat A" });
    const doneVisit = await finalVisit(world, { pharmacyNote: "Obat B" });
    const noneVisit = await finalVisit(world, { pharmacyNote: "Anjuran saja" });
    const waiting = await seedDispensing(world, waitingVisit.appointmentId);
    const done = await seedDispensing(world, doneVisit.appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 2 }] });
    const none = await seedDispensing(world, noneVisit.appointmentId, { status: "TANPA_OBAT" });

    expect((await listDispensings({ view: "MENUNGGU" })).map((r) => r.id)).toContain(waiting.id);
    expect((await listDispensings({ view: "MENUNGGU" })).map((r) => r.id)).not.toContain(done.id);
    expect((await listDispensings({ view: "SELESAI" })).find((r) => r.id === done.id)).toMatchObject({
      patientName: `Pasien ${SLUG}`,
      status: "SELESAI",
      lineCount: 1,
    });
    expect((await listDispensings({ view: "TANPA_OBAT" })).map((r) => r.id)).toContain(none.id);
    expect((await listDispensings({ view: "MENUNGGU", q: `pasien ${SLUG}` })).map((r) => r.id)).toContain(waiting.id);
    expect((await listDispensings({ view: "MENUNGGU", q: "tidak-ada-orang-ini" })).map((r) => r.id)).not.toContain(waiting.id);
    expect(await countPendingDispensings()).toBeGreaterThanOrEqual(1);
  });

  it("rincian hanya memuat catatan Apoteker; data klinis lain tidak ikut", async () => {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "Amoxicillin 3x1" });
    const { id } = await seedDispensing(world, appointmentId, { lines: [{ itemId: world.drugId, quantity: 4, usage: "3 x 1" }] });
    const detail = await getDispensingDetail(id);
    expect(detail).toMatchObject({
      id,
      status: "MENUNGGU",
      version: 1,
      note: "Amoxicillin 3x1",
      patientName: `Pasien ${SLUG}`,
      invoiceState: "NONE",
      canReopen: false,
      lines: [{ itemId: world.drugId, quantity: 4, usage: "3 x 1" }],
    });
    // Nama kolom klinis dan kontak tidak boleh ikut terbawa di hasil.
    const json = JSON.stringify(detail);
    for (const secret of ["assessment", "subjective", "physicalExam", "medicalHistory", "allergies", "whatsapp"]) {
      expect(json).not.toContain(secret);
    }
    expect(await getDispensingDetail("tidak-ada")).toBeNull();
  });

  it("canReopen: selesai dan tagihan belum final; tidak bila tagihan final", async () => {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "x" });
    const { id } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 1 }] });
    expect(await getDispensingDetail(id)).toMatchObject({ canReopen: true, invoiceState: "NONE" });
    const invoice = await prisma.invoice.create({
      data: { patientId: world.patientId, appointmentId, branchId: world.branchId, createdById: "s1", createdByName: "x" },
    });
    expect(await getDispensingDetail(id)).toMatchObject({ canReopen: true, invoiceState: "DRAF" });
    await prisma.invoiceLine.create({ data: { invoiceId: invoice.id, kind: "LAYANAN", name: "x", quantity: 1, unitPrice: 1 } });
    await prisma.invoice.update({ where: { id: invoice.id }, data: { status: "FINAL", number: `TG-2032-${Date.now() % 100000}`, finalizedAt: new Date() } });
    expect(await getDispensingDetail(id)).toMatchObject({ canReopen: false, invoiceState: "FINAL" });
  });

  it("pilihan obat: aktif, berharga jual, dengan stok tersedia (tanpa batch kedaluwarsa); tanpa harga", async () => {
    await billingBatch(world, { invoiceNumber: "BP-1", itemId: world.drugId, quantity: 8, expiryDate: addDaysToDateString(today, 100) });
    await billingBatch(world, { invoiceNumber: "BP-2", itemId: world.drugId, quantity: 3, expiryDate: addDaysToDateString(today, -1) });
    const items = await listDispenseItems(world.branchId);
    const drug = items.find((i) => i.id === world.drugId);
    expect(drug).toEqual({ id: world.drugId, code: `${SLUG.toUpperCase()}-OBT`, name: `${SLUG} Amoxicillin`, unit: "kapsul", available: 8 });
    expect(Object.keys(drug!).sort()).toEqual(["available", "code", "id", "name", "unit"]);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { sellPrice: null } });
    expect((await listDispenseItems(world.branchId)).map((i) => i.id)).not.toContain(world.productId);
    await prisma.stockItem.update({ where: { id: world.productId }, data: { sellPrice: 150000 } });
  });

  it("hak akses: Resepsionis, Dokter, dan Admin Keuangan ditolak", async () => {
    for (const role of ["RESEPSIONIS", "DOKTER", "ADMIN_KEUANGAN"] as const) {
      actor.role = role;
      await expect(listDispensings({ view: "MENUNGGU" })).rejects.toThrow(/forbidden: dispense:read/);
      await expect(getDispensingDetail("x")).rejects.toThrow(/forbidden: dispense:read/);
      await expect(countPendingDispensings()).rejects.toThrow(/forbidden: dispense:read/);
      await expect(listDispenseItems(world.branchId)).rejects.toThrow(/forbidden: dispense:manage/);
    }
  });
});
