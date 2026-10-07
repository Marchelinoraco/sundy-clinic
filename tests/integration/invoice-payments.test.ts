// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import type { InvoicePaymentInput } from "@/lib/invoice";
import { addDaysToDateString, witaDateString } from "@/lib/time";
import { addFreeLine, createDirectSale } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { applyFinalDiscount, recordInvoicePayment, revokeInvoicePayment } from "@/server/invoice-payments";
import { getInvoiceDetail } from "@/server/invoice-read";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
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

const SLUG = "bayar-tagihan";
const WA = "6281200008840";
const today = witaDateString(new Date());

describe("pembayaran customer", () => {
  let world: BillingWorld;

  /** Tagihan final Rp 100.000 (satu baris bebas). */
  async function finalInvoice(price = 100000) {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    const { version } = await unwrap(addFreeLine({ invoiceId: id, version: 1, kind: "LAYANAN", name: "Layanan Uji", quantity: 1, unitPrice: price }));
    await unwrap(finalizeInvoice({ invoiceId: id, version }));
    return id;
  }
  const pay = (invoiceId: string, patch: Partial<InvoicePaymentInput> = {}) =>
    recordInvoicePayment({ invoiceId, amount: 40000, method: "TUNAI", paidAt: today, reference: "", ...patch });

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

  it("bayar sebagian lalu lunas; nominal di atas sisa ditolak", async () => {
    const id = await finalInvoice();
    const first = await unwrap(pay(id, { reference: "KW-1" }));
    expect((await getInvoiceDetail(id))?.totals).toMatchObject({ paid: 40000, balance: 60000, display: "SEBAGIAN" });
    expect(await pay(id, { amount: 60001 })).toEqual({ ok: false, error: "Nominal melebihi sisa tagihan (Rp 60.000)." });
    const second = await unwrap(pay(id, { amount: 60000, method: "QRIS" }));
    expect((await getInvoiceDetail(id))?.totals).toMatchObject({ balance: 0, display: "LUNAS" });
    expect(await pay(id, { amount: 1 })).toEqual({ ok: false, error: "Tagihan ini tidak punya sisa." });

    const payments = (await getInvoiceDetail(id))!.payments;
    expect(payments.map((p) => [p.amount, p.method, p.reference])).toEqual([
      [40000, "TUNAI", "KW-1"],
      [60000, "QRIS", null],
    ]);
    expect(await prisma.auditLog.count({ where: { action: "invoice-payment.create", entityId: { in: [first.id, second.id] } } })).toBe(2);
  });

  it("dua pembayaran bersamaan yang masing-masing melunasi: hanya satu diterima", async () => {
    const id = await finalInvoice();
    const results = await Promise.all([pay(id, { amount: 100000 }), pay(id, { amount: 100000 })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: "Tagihan ini tidak punya sisa." });
    expect(await prisma.invoicePayment.count({ where: { invoiceId: id, revokedAt: null } })).toBe(1);
  });

  it("hanya tagihan final yang bisa dibayar", async () => {
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId }));
    const message = "Tagihan ini belum final atau sudah dibatalkan.";
    expect(await pay(id)).toEqual({ ok: false, error: message });
    const final = await finalInvoice();
    await unwrap(cancelInvoice({ invoiceId: final, reason: "Salah" }));
    expect(await pay(final)).toEqual({ ok: false, error: message });
    expect(await pay("tidak-ada")).toEqual({ ok: false, error: "Tagihan tidak ditemukan." });
  });

  it("menolak tanggal bayar di masa depan atau sebelum tagihan difinalkan, dan permintaan buatan", async () => {
    const id = await finalInvoice();
    expect(await pay(id, { paidAt: addDaysToDateString(today, 1) })).toEqual({ ok: false, error: "Tanggal bayar tidak boleh di masa depan." });
    expect(await pay(id, { paidAt: addDaysToDateString(today, -1) })).toEqual({
      ok: false,
      error: "Tanggal bayar tidak boleh sebelum tagihan difinalkan.",
    });
    expect(await pay(id, { paidAt: "2026-02-31" })).toEqual({ ok: false, error: "Isi tanggal bayar." });
    expect(await pay(id, { amount: 0 })).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await pay(id, { amount: 1000.5 })).toEqual({ ok: false, error: "Nominal harus bilangan bulat lebih dari 0." });
    expect(await pay(id, { method: "CEK" as never })).toEqual({ ok: false, error: "Pilih metode pembayaran." });
    expect(await prisma.invoicePayment.count({ where: { invoiceId: id } })).toBe(0);
  });

  it("batalkan pembayaran: hanya Admin Keuangan; sisa kembali; tidak bisa dua kali", async () => {
    const id = await finalInvoice();
    const { id: paymentId } = await unwrap(pay(id, { amount: 100000 }));
    await expect(revokeInvoicePayment({ paymentId, reason: "Salah catat" })).rejects.toThrow(/forbidden: invoice:correct/);

    actor.role = "ADMIN_KEUANGAN";
    expect(await revokeInvoicePayment({ paymentId, reason: " " })).toEqual({ ok: false, error: "Isi alasan." });
    await unwrap(revokeInvoicePayment({ paymentId, reason: "Nominal salah catat" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ totals: { paid: 0, balance: 100000, display: "BELUM_DIBAYAR" } });
    expect(await prisma.invoicePayment.findUniqueOrThrow({ where: { id: paymentId } })).toMatchObject({
      revokedByName: "Resepsionis Uji",
      revokeReason: "Nominal salah catat",
    });
    expect(await revokeInvoicePayment({ paymentId, reason: "lagi" })).toEqual({ ok: false, error: "Pembayaran ini sudah dibatalkan." });
    expect(await revokeInvoicePayment({ paymentId: "tidak-ada", reason: "x" })).toEqual({ ok: false, error: "Pembayaran tidak ditemukan." });
    expect(await prisma.auditLog.count({ where: { action: "invoice-payment.revoke", entityId: paymentId } })).toBe(1);
  });

  it("diskon sesudah final: hanya Admin Keuangan, tambahan saja, dan tidak di bawah yang sudah dibayar", async () => {
    const id = await finalInvoice();
    await unwrap(pay(id, { amount: 30000 }));
    await expect(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 30, reason: "Kebijakan" })).rejects.toThrow(/forbidden: invoice:correct/);

    actor.role = "ADMIN_KEUANGAN";
    await unwrap(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 30, reason: "Kompensasi keluhan" }));
    expect(await getInvoiceDetail(id)).toMatchObject({
      discountKind: "PERSEN",
      discountValue: 30,
      discountReason: "Kompensasi keluhan",
      totals: { discount: 30000, total: 70000, balance: 40000 },
    });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 20, reason: "Turun" })).toEqual({
      ok: false,
      error: "Diskon sesudah final hanya bisa ditambah.",
    });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 80, reason: "Terlalu besar" })).toEqual({
      ok: false,
      error: "Diskon membuat total di bawah yang sudah dibayar.",
    });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "NOMINAL", value: 5000, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon sesudah final hanya bisa ditambah.",
    });
    expect(await prisma.auditLog.count({ where: { action: "invoice.discount", entityId: id } })).toBe(1);
  });

  it("diskon yang membuat sisa 0 melunasi tagihan; tagihan lunas atau draf tidak bisa diberi diskon", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    await unwrap(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 100, reason: "Pembebasan biaya" }));
    expect(await getInvoiceDetail(id)).toMatchObject({ totals: { total: 0, display: "LUNAS" } });
    expect(await applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 100, reason: "lagi" })).toEqual({
      ok: false,
      error: "Tagihan ini sudah lunas.",
    });
    actor.role = "RESEPSIONIS";
    const { id: draftId } = await unwrap(createDirectSale({ patientId: world.patientId }));
    actor.role = "ADMIN_KEUANGAN";
    expect(await applyFinalDiscount({ invoiceId: draftId, kind: "PERSEN", value: 10, reason: "x" })).toEqual({
      ok: false,
      error: "Diskon sesudah final hanya untuk tagihan yang sudah final.",
    });
  });

  it("hak akses: Admin Keuangan tidak mencatat pembayaran; Dokter dan Apoteker tidak menyentuh uang", async () => {
    const id = await finalInvoice();
    actor.role = "ADMIN_KEUANGAN";
    await expect(pay(id)).rejects.toThrow(/forbidden: invoice:manage/);
    for (const role of ["DOKTER", "APOTEKER"] as const) {
      actor.role = role;
      await expect(pay(id)).rejects.toThrow(/forbidden: invoice:manage/);
      await expect(applyFinalDiscount({ invoiceId: id, kind: "PERSEN", value: 5, reason: "x" })).rejects.toThrow(/forbidden: invoice:correct/);
    }
  });
});
