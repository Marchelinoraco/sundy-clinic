// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { createDirectSale, createInvoiceFromVisit } from "@/server/invoice-drafts";
import { countBillable, getInvoiceDetail, listBillableVisits, listBillingItems, listInvoices } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "SUPER_ADMIN" | "RESEPSIONIS" | "ADMIN_KEUANGAN" | "APOTEKER" | "DOKTER";
const { actor } = vi.hoisted(() => ({
  actor: { userId: "u1", staffId: "s1", name: "Resepsionis Uji", role: "RESEPSIONIS" as Role, email: "uji@sundy.test" },
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

const SLUG = "buat-tagihan";
const WA = "6281200008810";
const today = witaDateString(new Date());

describe("membuat tagihan", () => {
  let world: BillingWorld;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
  });

  beforeEach(() => {
    actor.role = "RESEPSIONIS";
  });

  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("dari kunjungan final: konsultasi dan treatment terisi dengan harga katalog", async () => {
    const { appointmentId } = await finalVisit(world);
    const { id, existing } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(existing).toBe(false);

    const detail = await getInvoiceDetail(id);
    expect(detail).toMatchObject({
      status: "DRAF",
      number: null,
      version: 1,
      appointmentId,
      patient: { id: world.patientId },
      branchId: world.branchId,
      totals: { subtotal: 450000, total: 450000, balance: 450000, display: "DRAF" },
    });
    expect(detail?.lines.map((line) => [line.kind, line.name, line.quantity, line.unitPrice])).toEqual([
      ["LAYANAN", "Konsultasi Dokter", 1, 200000],
      ["TREATMENT", "Facial Uji", 1, 250000],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "invoice.create", entityId: id } })).toBe(1);
  });

  it("dua klik bersamaan menghasilkan satu tagihan, dan yang kedua dibawa ke tagihan yang sama", async () => {
    const { appointmentId } = await finalVisit(world);
    const results = await Promise.all([createInvoiceFromVisit(appointmentId), createInvoiceFromVisit(appointmentId)]);
    const ids = results.map((result) => (result.ok ? result.data.id : null));
    expect(ids[0]).not.toBeNull();
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.invoice.count({ where: { appointmentId } })).toBe(1);
    expect(results.filter((result) => result.ok && result.data.existing)).toHaveLength(1);
  });

  it("menolak kunjungan yang catatannya belum final atau tidak ada", async () => {
    const draft = await prisma.appointment.create({
      data: {
        code: "BTG-DRAF",
        type: "KONSULTASI",
        startAt: new Date("2031-02-01T00:00:00Z"),
        endAt: new Date("2031-02-01T00:30:00Z"),
        status: "HADIR",
        source: "WALK_IN",
        branchId: world.branchId,
        staffId: world.doctorId,
        serviceId: world.consultationId,
        patientId: world.patientId,
      },
    });
    const message = "Hanya kunjungan yang catatannya sudah final yang bisa ditagih.";
    expect(await createInvoiceFromVisit(draft.id)).toEqual({ ok: false, error: message });
    await prisma.encounter.create({ data: { appointmentId: draft.id, createdById: world.doctorId, createdByName: "dr. Uji" } });
    expect(await createInvoiceFromVisit(draft.id)).toEqual({ ok: false, error: message });
    expect(await createInvoiceFromVisit("tidak-ada")).toEqual({ ok: false, error: "Kunjungan tidak ditemukan." });
  });

  it("Konsultasi Online tidak mendapat baris konsultasi, dan tanpa treatment tidak perlu ditagih", async () => {
    const withTreatment = await finalVisit(world, { channel: "ONLINE" });
    const onlyOnline = await finalVisit(world, { channel: "ONLINE", treatments: [] });
    const waiting = (await listBillableVisits()).map((visit) => visit.appointmentId);
    expect(waiting).toContain(withTreatment.appointmentId);
    expect(waiting).not.toContain(onlyOnline.appointmentId);

    const { id } = await unwrap(createInvoiceFromVisit(withTreatment.appointmentId));
    expect((await getInvoiceDetail(id))?.lines.map((line) => line.name)).toEqual(["Facial Uji"]);
  });

  it("Perlu ditagih: kunjungan final tanpa tagihan aktif dalam 30 hari; hilang setelah ditagih, kembali setelah dibatalkan", async () => {
    const recent = await finalVisit(world);
    const old = await finalVisit(world, { finalizedAt: new Date(Date.now() - 31 * 24 * 3600_000) });
    const before = await countBillable();
    const ids = () => listBillableVisits().then((rows) => rows.map((row) => row.appointmentId));
    expect(await ids()).toContain(recent.appointmentId);
    expect(await ids()).not.toContain(old.appointmentId);

    const { id } = await unwrap(createInvoiceFromVisit(recent.appointmentId));
    expect(await ids()).not.toContain(recent.appointmentId);
    expect(await countBillable()).toBe(before - 1);

    await prisma.invoice.update({ where: { id }, data: { status: "DIBATALKAN", cancelledAt: new Date() } });
    expect(await ids()).toContain(recent.appointmentId);
    const again = await unwrap(createInvoiceFromVisit(recent.appointmentId));
    expect(again.id).not.toBe(id);
  });

  it("layanan tanpa harga menjadi baris Rp 0 yang bisa diedit", async () => {
    const free = await prisma.service.create({
      data: { slug: `${SLUG}-gratis`, name: "Layanan Gratis Uji", promoPrice: 0, categoryId: (await prisma.serviceCategory.findFirstOrThrow()).id },
    });
    const { appointmentId } = await finalVisit(world, { treatments: [{ serviceId: free.id, serviceName: "Layanan Gratis Uji" }] });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect((await getInvoiceDetail(id))?.lines.find((line) => line.name === "Layanan Gratis Uji")?.unitPrice).toBe(0);
  });

  it("penjualan langsung: draf tanpa kunjungan; pasien dan cabang diperiksa", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    expect(await getInvoiceDetail(id)).toMatchObject({ status: "DRAF", appointmentId: null, lines: [], totals: { total: 0 } });

    expect(await createDirectSale({ patientId: "tidak-ada" })).toEqual({ ok: false, error: "Pasien tidak ditemukan." });
    const soon = await prisma.branch.create({
      data: { slug: `${SLUG}-segera`, name: "Segera", address: "x", whatsapp: "6285172228900", openingHours: "-", status: "SEGERA_HADIR", sortOrder: 95 },
    });
    expect(await createDirectSale({ patientId: world.patientId, branchId: soon.id })).toEqual({
      ok: false,
      error: "Cabang ini belum menerima transaksi.",
    });
    const owner = await prisma.patient.create({ data: { medicalRecordNumber: "SDY-2026-8899", name: "Pasien Asli", whatsapp: "6281200008811" } });
    const duplicate = await prisma.patient.create({
      data: { medicalRecordNumber: "SDY-2026-8898", name: "Pasien Rangkap", whatsapp: "6281200008812", mergedIntoId: owner.id },
    });
    try {
      expect(await createDirectSale({ patientId: duplicate.id })).toEqual({
        ok: false,
        error: "Pasien ini rangkap dari Pasien Asli (SDY-2026-8899). Buat tagihan untuk pasien itu.",
      });
    } finally {
      await prisma.patient.deleteMany({ where: { id: { in: [duplicate.id, owner.id] } } });
      await prisma.branch.delete({ where: { id: soon.id } });
    }
  });

  it("daftar tagihan per tampilan dan pencarian nama pasien atau nomor", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    const draft = await listInvoices({ view: "DRAF" });
    expect(draft.find((row) => row.id === id)).toMatchObject({ patientName: `Pasien ${SLUG}`, display: "DRAF", total: 0, lineCount: 0 });
    expect((await listInvoices({ view: "LUNAS" })).map((row) => row.id)).not.toContain(id);
    expect((await listInvoices({ view: "DRAF", q: `pasien ${SLUG}` })).map((row) => row.id)).toContain(id);
    expect((await listInvoices({ view: "DRAF", q: "tidak-ada-orang-ini" })).map((row) => row.id)).not.toContain(id);
  });

  it("tampilan Belum lunas tetap memuat tagihan lama walau ada lebih dari 300 tagihan yang lebih baru", async () => {
    const old = await unwrap(createDirectSale({ patientId: world.patientId }));
    await prisma.invoiceLine.create({ data: { invoiceId: old.id, kind: "LAYANAN", name: "Lama", quantity: 1, unitPrice: 1000 } });
    await prisma.invoice.update({ where: { id: old.id }, data: { status: "FINAL", number: `TG-2031-${Date.now() % 100000}`, finalizedAt: new Date(), createdAt: new Date("2020-01-01T00:00:00Z") } });
    await prisma.invoice.createMany({
      data: Array.from({ length: 305 }, () => ({ patientId: world.patientId, branchId: world.branchId, createdById: "s1", createdByName: "Uji" })),
    });
    expect((await listInvoices({ view: "BELUM_LUNAS" })).map((row) => row.id)).toContain(old.id);
  });

  it("katalog barang untuk tagihan: hanya yang berharga jual, dengan stok tersedia di cabang", async () => {
    await billingBatch(world, { invoiceNumber: "BT-1", itemId: world.drugId, quantity: 8, expiryDate: addDaysToDateString(today, 100) });
    await billingBatch(world, { invoiceNumber: "BT-2", itemId: world.drugId, quantity: 3, expiryDate: addDaysToDateString(today, -1) });
    await prisma.stockItem.create({ data: { code: `${SLUG.toUpperCase()}-NOP`, name: `${SLUG} Tanpa Harga`, kind: "PRODUK", unit: "pcs" } });

    const items = await listBillingItems(world.branchId);
    const drug = items.find((item) => item.id === world.drugId);
    expect(drug).toMatchObject({ sellPrice: 2000, available: 8, unit: "kapsul" });
    expect(items.find((item) => item.id === world.productId)).toMatchObject({ available: 0 });
    expect(items.map((item) => item.name)).not.toContain(`${SLUG} Tanpa Harga`);
  });

  it("hak akses: Admin Keuangan tidak membuat tagihan; Apoteker dan Dokter tidak membaca", async () => {
    const { appointmentId } = await finalVisit(world);
    actor.role = "ADMIN_KEUANGAN";
    await expect(createInvoiceFromVisit(appointmentId)).rejects.toThrow(/forbidden: invoice:manage/);
    await expect(createDirectSale({ patientId: world.patientId })).rejects.toThrow(/forbidden: invoice:manage/);
    await expect(listBillingItems(world.branchId)).rejects.toThrow(/forbidden: invoice:manage/);
    expect(Array.isArray(await listInvoices({ view: "DRAF" }))).toBe(true);
    for (const role of ["APOTEKER", "DOKTER"] as const) {
      actor.role = role;
      await expect(listInvoices({ view: "DRAF" })).rejects.toThrow(/forbidden: invoice:read/);
      await expect(listBillableVisits()).rejects.toThrow(/forbidden: invoice:read/);
    }
  });
});
