// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addDispensingLine } from "@/server/dispensing-drafts";
import { completeDispensing, markNoDispensing, reopenDispensing } from "@/server/dispensing-lifecycle";
import { createDirectSale, createInvoiceFromVisit, removeInvoiceLine, updateInvoiceLine } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail, listBillableVisits } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

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

const SLUG = "tagihan-penyerahan";
const WA = "6281200008904";
const today = witaDateString(new Date());

describe("tagihan dan penyerahan obat", () => {
  let world: BillingWorld;
  const as = (role: Role) => {
    actor.role = role;
  };

  async function visit(note = "Amoxicillin") {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: note });
    const { id } = await seedDispensing(world, appointmentId);
    return { appointmentId, dispensingId: id };
  }
  async function handed(dispensingId: string, qty = 2) {
    as("APOTEKER");
    const added = await unwrap(addDispensingLine({ dispensingId, version: 1, itemId: world.drugId, quantity: qty, usage: "3 x 1" }));
    await unwrap(completeDispensing({ dispensingId, version: added.version }));
  }
  const draftOf = async (appointmentId: string) => {
    as("RESEPSIONIS");
    return (await unwrap(createInvoiceFromVisit(appointmentId))).id;
  };
  const lineOf = (invoiceId: string) => prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, dispensingLineId: { not: null } } });
  const stockLeft = async () =>
    (await prisma.stockBatch.aggregate({ where: { itemId: world.drugId, branchId: world.branchId }, _sum: { quantityRemaining: true } }))._sum.quantityRemaining;

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    await billingBatch(world, { invoiceNumber: "TP-1", itemId: world.drugId, quantity: 50, expiryDate: addDaysToDateString(today, 365) });
  });
  beforeEach(() => as("APOTEKER"));
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("finalisasi tertahan selama penyerahan Menunggu; lepas setelah Tanpa obat atau Selesai", async () => {
    const waiting = await visit();
    const invoiceId = await draftOf(waiting.appointmentId);
    expect(await finalizeInvoice({ invoiceId, version: 1 })).toEqual({ ok: false, error: "Menunggu Apoteker menyerahkan obat." });
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).status).toBe("DRAF");

    as("APOTEKER");
    const dispensing = await prisma.dispensing.findUniqueOrThrow({ where: { id: waiting.dispensingId } });
    await unwrap(markNoDispensing({ dispensingId: waiting.dispensingId, version: dispensing.version }));
    as("RESEPSIONIS");
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect((await finalizeInvoice({ invoiceId, version: invoice.version })).ok).toBe(true);

    const done = await visit();
    await handed(done.dispensingId);
    const id2 = await draftOf(done.appointmentId);
    const v2 = (await prisma.invoice.findUniqueOrThrow({ where: { id: id2 } })).version;
    expect((await finalizeInvoice({ invoiceId: id2, version: v2 })).ok).toBe(true);
  });

  it("penjualan langsung dan kunjungan tanpa penyerahan tidak tertahan", async () => {
    const { appointmentId } = await finalVisit(world);
    const invoiceId = await draftOf(appointmentId);
    expect((await finalizeInvoice({ invoiceId, version: 1 })).ok).toBe(true);
  });

  it("resepsionis tidak bisa menghapus atau mengubah jumlah baris obat; harga bisa diubah dengan catatan", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId, 2);
    const invoiceId = await draftOf(appointmentId);
    const line = await lineOf(invoiceId);
    let version = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

    expect(await removeInvoiceLine({ invoiceId, version, lineId: line.id })).toEqual({
      ok: false,
      error: "Obat dari penyerahan tidak bisa dihapus. Minta Apoteker membuka kembali penyerahan.",
    });
    expect(await updateInvoiceLine({ invoiceId, version, lineId: line.id, quantity: 5, unitPrice: 2000, priceNote: "" })).toEqual({
      ok: false,
      error: "Jumlah obat dari penyerahan tidak bisa diubah. Minta Apoteker membuka kembali penyerahan.",
    });
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ quantity: 2, unitPrice: 2000 });
    version = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
    await unwrap(updateInvoiceLine({ invoiceId, version, lineId: line.id, quantity: 2, unitPrice: 1500, priceNote: "Promo apotek" }));
    expect(await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).toMatchObject({ unitPrice: 1500, priceNote: "Promo apotek" });
  });

  it("batalkan draf: baris dilepas; penyerahan tetap Selesai; tagihan baru terisi lagi", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId);
    const first = await draftOf(appointmentId);
    await unwrap(cancelInvoice({ invoiceId: first, reason: "Salah buat" }));
    expect(await prisma.invoiceLine.count({ where: { invoiceId: first, dispensingLineId: { not: null } } })).toBe(0);
    expect((await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } })).status).toBe("SELESAI");
    const second = await draftOf(appointmentId);
    expect((await lineOf(second)).quantity).toBe(2);
  });

  it("batalkan tagihan final: penyerahan kembali Menunggu, stok kembali, dan ditagih sekali saja", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId, 2);
    const first = await draftOf(appointmentId);
    const before = await stockLeft();
    const v1 = (await prisma.invoice.findUniqueOrThrow({ where: { id: first } })).version;
    await unwrap(finalizeInvoice({ invoiceId: first, version: v1 }));
    expect(await stockLeft()).toBe((before ?? 0) - 2);

    await unwrap(cancelInvoice({ invoiceId: first, reason: "Pelanggan batal" }));
    expect(await stockLeft()).toBe(before);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: first, dispensingLineId: { not: null } } })).toBe(0);
    expect(await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } })).toMatchObject({ status: "MENUNGGU", completedAt: null });

    // Tagihan baru: tanpa baris obat dan tertahan, sampai Apoteker menyerahkan lagi.
    const second = await draftOf(appointmentId);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: second, dispensingLineId: { not: null } } })).toBe(0);
    const v2 = (await prisma.invoice.findUniqueOrThrow({ where: { id: second } })).version;
    expect(await finalizeInvoice({ invoiceId: second, version: v2 })).toEqual({ ok: false, error: "Menunggu Apoteker menyerahkan obat." });
    as("APOTEKER");
    const d = await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } });
    await unwrap(completeDispensing({ dispensingId, version: d.version }));
    expect(await prisma.invoiceLine.count({ where: { invoiceId: second, dispensingLineId: { not: null } } })).toBe(1);
    as("RESEPSIONIS");
    const v3 = (await prisma.invoice.findUniqueOrThrow({ where: { id: second } })).version;
    await unwrap(finalizeInvoice({ invoiceId: second, version: v3 }));
    expect(await stockLeft()).toBe((before ?? 0) - 2);
  });

  it("buka kembali dan finalisasi bersamaan: salah satu menang, tagihan final tidak pernah memuat baris obat yang dibuka kembali", async () => {
    const { appointmentId, dispensingId } = await visit();
    await handed(dispensingId);
    const invoiceId = await draftOf(appointmentId);
    const version = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
    as("SUPER_ADMIN");
    const [reopened, finalized] = await Promise.all([reopenDispensing({ dispensingId }), finalizeInvoice({ invoiceId, version })]);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    const dispensing = await prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } });
    const linked = await prisma.invoiceLine.count({ where: { invoiceId, dispensingLineId: { not: null } } });
    expect(reopened.ok !== finalized.ok).toBe(true);
    if (finalized.ok) {
      expect(invoice.status).toBe("FINAL");
      expect(dispensing.status).toBe("SELESAI");
      expect(linked).toBe(1);
    } else {
      expect(invoice.status).toBe("DRAF");
      expect(dispensing.status).toBe("MENUNGGU");
      expect(linked).toBe(0);
    }
  });

  it("konsultasi online tanpa treatment tetap bisa ditagih bila punya penyerahan", async () => {
    const plain = await finalVisit(world, { channel: "ONLINE", treatments: [] });
    const withNote = await finalVisit(world, { channel: "ONLINE", treatments: [], pharmacyNote: "Amoxicillin" });
    await seedDispensing(world, withNote.appointmentId);
    as("RESEPSIONIS");
    const ids = (await listBillableVisits()).map((v) => v.appointmentId);
    expect(ids).toContain(withNote.appointmentId);
    expect(ids).not.toContain(plain.appointmentId);
  });

  it("rincian tagihan: status penyerahan dan tanda baris obat, tanpa isi Catatan untuk Apoteker", async () => {
    const { appointmentId, dispensingId } = await visit("RAHASIA-CATATAN-DOKTER");
    await handed(dispensingId);
    const invoiceId = await draftOf(appointmentId);
    const detail = await getInvoiceDetail(invoiceId);
    expect(detail?.dispensing).toBe("SELESAI");
    expect(detail?.lines.filter((l) => l.fromDispensing)).toHaveLength(1);
    expect(detail?.lines.filter((l) => !l.fromDispensing).length).toBeGreaterThan(0);
    expect(JSON.stringify(detail)).not.toContain("RAHASIA-CATATAN-DOKTER");

    const direct = await unwrap(createDirectSale({ patientId: world.patientId }));
    expect((await getInvoiceDetail(direct.id))?.dispensing).toBeNull();
  });
});
