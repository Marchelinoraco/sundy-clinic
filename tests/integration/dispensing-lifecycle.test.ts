// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addDispensingLine, removeDispensingLine } from "@/server/dispensing-drafts";
import { completeDispensing, markNoDispensing, reopenDispensing } from "@/server/dispensing-lifecycle";
import { createInvoiceFromVisit } from "@/server/invoice-drafts";
import { finalizeInvoice } from "@/server/invoice-lifecycle";
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

const SLUG = "siklus-penyerahan";
const WA = "6281200008903";
const today = witaDateString(new Date());

describe("siklus penyerahan obat", () => {
  let world: BillingWorld;

  const as = (role: Role) => {
    actor.role = role;
  };

  /** Kunjungan final bercatatan Apoteker + penyerahan Menunggu. */
  async function visit() {
    const { appointmentId } = await finalVisit(world, { pharmacyNote: "Amoxicillin" });
    const { id } = await seedDispensing(world, appointmentId);
    return { appointmentId, dispensingId: id };
  }
  /** Menambah obat lewat aksi (sebagai Apoteker); mengembalikan versi terbaru. */
  async function addDrug(dispensingId: string, version: number, patch: Record<string, unknown> = {}) {
    as("APOTEKER");
    const result = await unwrap(
      addDispensingLine({ dispensingId, version, itemId: world.drugId, quantity: 3, usage: "3 x 1 sesudah makan", ...patch }),
    );
    return result.version;
  }
  const status = async (dispensingId: string) => prisma.dispensing.findUniqueOrThrow({ where: { id: dispensingId } });
  const linked = (invoiceId: string) => prisma.invoiceLine.findMany({ where: { invoiceId, dispensingLineId: { not: null } } });

  beforeAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    world = await createBillingWorld(SLUG, WA);
    await billingBatch(world, { invoiceNumber: "SP-1", itemId: world.drugId, quantity: 50, expiryDate: addDaysToDateString(today, 365) });
  });
  beforeEach(() => as("APOTEKER"));
  afterAll(async () => {
    await cleanupBillingWorld(SLUG, [WA]);
    await prisma.$disconnect();
  });

  it("selesai tanpa tagihan: status Selesai; saat tagihan dibuat, baris obat ikut terisi dengan harga jual", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    expect(await status(dispensingId)).toMatchObject({ status: "SELESAI", completedByName: "Apoteker Uji", version: version + 1 });
    expect(await prisma.invoice.count({ where: { appointmentId } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "dispensing.complete", entityId: dispensingId } })).toBe(1);

    as("RESEPSIONIS");
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const lines = await linked(id);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: "BARANG", itemId: world.drugId, quantity: 3, unitPrice: 2000, name: `${SLUG} Amoxicillin` });
  });

  it("selesai saat draf tagihan sudah ada: baris ditambahkan dan versi draf naik", async () => {
    const { appointmentId, dispensingId } = await visit();
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
    expect(await linked(invoiceId)).toHaveLength(0);

    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    expect(await linked(invoiceId)).toHaveLength(1);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version).toBe(before.version + 1);
  });

  it("menolak selesai tanpa obat, stok kurang (termasuk jumlah gabungan), versi usang, dan penyerahan yang sudah diproses", async () => {
    const { dispensingId } = await visit();
    expect(await completeDispensing({ dispensingId, version: 1 })).toEqual({ ok: false, error: "Tambahkan obat dulu, atau pilih Tanpa obat." });

    let version = await addDrug(dispensingId, 1, { itemId: world.productId, quantity: 1 });
    expect(await completeDispensing({ dispensingId, version })).toEqual({ ok: false, error: `Stok ${SLUG} Serum C tidak cukup (tersedia 0).` });

    as("APOTEKER");
    const lines = await prisma.dispensingLine.findMany({ where: { dispensingId } });
    version = (await unwrap(removeDispensingLine({ dispensingId, version, lineId: lines[0].id }))).version;
    version = await addDrug(dispensingId, version, { quantity: 30 });
    version = await addDrug(dispensingId, version, { quantity: 30 });
    expect((await completeDispensing({ dispensingId, version })).ok).toBe(false);
    expect(await completeDispensing({ dispensingId, version: version - 1 })).toEqual({
      ok: false,
      error: "Penyerahan ini baru diubah orang lain. Muat ulang halaman.",
    });
    expect((await status(dispensingId)).status).toBe("MENUNGGU");

    const done = await visit();
    const v = await addDrug(done.dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId: done.dispensingId, version: v }));
    expect(await completeDispensing({ dispensingId: done.dispensingId, version: v + 1 })).toEqual({
      ok: false,
      error: "Penyerahan ini sudah diproses. Muat ulang halaman.",
    });
  });

  it("tanpa obat: hanya bila tidak ada obat; melepas penahanan; audit tercatat", async () => {
    const { dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    expect(await markNoDispensing({ dispensingId, version })).toEqual({
      ok: false,
      error: "Penyerahan ini punya obat. Hapus obatnya dulu, atau pilih Selesai.",
    });
    const only = await visit();
    await unwrap(markNoDispensing({ dispensingId: only.dispensingId, version: 1 }));
    expect(await status(only.dispensingId)).toMatchObject({ status: "TANPA_OBAT", completedByName: "Apoteker Uji" });
    expect(await prisma.auditLog.count({ where: { action: "dispensing.none", entityId: only.dispensingId } })).toBe(1);
  });

  it("buka kembali mencabut baris dari draf tagihan dan mengembalikan status Menunggu", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect(await linked(invoiceId)).toHaveLength(1);
    const invoiceVersion = (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;

    as("APOTEKER");
    await unwrap(reopenDispensing({ dispensingId }));
    expect(await status(dispensingId)).toMatchObject({ status: "MENUNGGU", completedAt: null, completedByName: null });
    expect(await linked(invoiceId)).toHaveLength(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version).toBe(invoiceVersion + 1);
    expect(await prisma.auditLog.count({ where: { action: "dispensing.reopen", entityId: dispensingId } })).toBe(1);
    expect(await reopenDispensing({ dispensingId })).toEqual({ ok: false, error: "Penyerahan ini masih menunggu." });
  });

  it("tidak bisa dibuka kembali setelah tagihan final", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    await unwrap(completeDispensing({ dispensingId, version }));
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    await unwrap(finalizeInvoice({ invoiceId, version: 1 }));
    as("APOTEKER");
    expect(await reopenDispensing({ dispensingId })).toEqual({
      ok: false,
      error: "Tagihan kunjungan ini sudah final. Penyerahan tidak bisa dibuka kembali.",
    });
    expect((await status(dispensingId)).status).toBe("SELESAI");
  });

  it("dua Apoteker menyelesaikan bersamaan: hanya satu berhasil, baris tagihan tidak ganda", async () => {
    const { appointmentId, dispensingId } = await visit();
    as("RESEPSIONIS");
    const { id: invoiceId } = await unwrap(createInvoiceFromVisit(appointmentId));
    const version = await addDrug(dispensingId, 1);
    const results = await Promise.all([completeDispensing({ dispensingId, version }), completeDispensing({ dispensingId, version })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await linked(invoiceId)).toHaveLength(1);
  });

  it("membuat tagihan bersamaan dengan penyelesaian: baris obat tidak hilang dan tidak ganda", async () => {
    const { appointmentId, dispensingId } = await visit();
    const version = await addDrug(dispensingId, 1);
    as("SUPER_ADMIN");
    const [created, completed] = await Promise.all([createInvoiceFromVisit(appointmentId), completeDispensing({ dispensingId, version })]);
    const { id: invoiceId } = await unwrap(Promise.resolve(created));

    const row = await status(dispensingId);
    if (completed.ok) {
      expect(row.status).toBe("SELESAI");
      expect(await linked(invoiceId)).toHaveLength(1);
    } else {
      // Kalah balapan: penyerahan tetap Menunggu dan tagihan tanpa baris obat; mengulang berhasil.
      expect(completed).toEqual({ ok: false, error: "Tagihan kunjungan ini baru berubah. Muat ulang halaman lalu coba lagi." });
      expect(row.status).toBe("MENUNGGU");
      expect(await linked(invoiceId)).toHaveLength(0);
      await unwrap(completeDispensing({ dispensingId, version }));
      expect(await linked(invoiceId)).toHaveLength(1);
    }
  });

  it("hak akses: Resepsionis, Dokter, dan Admin Keuangan tidak bisa menyelesaikan, menandai, atau membuka kembali", async () => {
    const { dispensingId } = await visit();
    for (const role of ["RESEPSIONIS", "DOKTER", "ADMIN_KEUANGAN"] as const) {
      as(role);
      await expect(completeDispensing({ dispensingId, version: 1 })).rejects.toThrow(/forbidden: dispense:manage/);
      await expect(markNoDispensing({ dispensingId, version: 1 })).rejects.toThrow(/forbidden: dispense:manage/);
      await expect(reopenDispensing({ dispensingId })).rejects.toThrow(/forbidden: dispense:manage/);
    }
    expect((await status(dispensingId)).status).toBe("MENUNGGU");
  });
});
