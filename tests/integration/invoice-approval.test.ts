// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { APPROVAL_REQUIRED, PIN_WRONG } from "@/lib/approval";
import { prisma } from "@/lib/db";
import { addFreeLine, addInvoiceItem, clearLineDiscount, createDirectSale, setInvoiceDiscount, setLineDiscount, updateInvoiceLine } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { applyFinalDiscount } from "@/server/invoice-payments";
import { TEST_APPROVER_NAME, testApproval } from "./approver";
import { cleanupBillingWorld, createBillingWorld, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";

type Role = "RESEPSIONIS" | "ADMIN_KEUANGAN";
const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Resepsionis PIN", role: "RESEPSIONIS" as Role, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

// Tindakan tagihan yang menuntut PIN persetujuan (spec PIN P1–P6, P11).
const SLUG = "tagihan-pin";
const WA = "6281200009611";
let world: BillingWorld;

const versionOf = async (invoiceId: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })).version;
const lineOf = (invoiceId: string, name: string) => prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId, name } });

/** Draf: produk katalog Rp150.000 + layanan bebas Rp100.000. */
async function draft() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  const { version } = await unwrap(addInvoiceItem({ invoiceId: id, version: 1, itemId: world.productId, quantity: 1 }));
  await unwrap(addFreeLine({ invoiceId: id, version, kind: "LAYANAN", name: "Layanan PIN", quantity: 1, unitPrice: 100_000, approval: await testApproval() }));
  return id;
}

/** Tagihan final berisi satu layanan bebas Rp100.000 (tanpa stok). */
async function finalInvoice() {
  const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
  const { version } = await unwrap(addFreeLine({ invoiceId: id, version: 1, kind: "LAYANAN", name: "Layanan Final", quantity: 1, unitPrice: 100_000, approval: await testApproval() }));
  await unwrap(finalizeInvoice({ invoiceId: id, version }));
  return id;
}

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

describe("PIN persetujuan di tagihan", () => {
  it("tanpa approval setiap tindakan yang dijaga ditolak APPROVAL_REQUIRED, termasuk oleh Admin Keuangan (Review Focus 1, spec P2)", async () => {
    const id = await draft();
    const final = await finalInvoice();
    const product = await lineOf(id, `${SLUG} Serum C`);
    const free = await lineOf(id, "Layanan PIN");
    const denied = { ok: false, error: APPROVAL_REQUIRED };
    expect(await updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 1, unitPrice: 140_000, priceNote: "Harga teman" })).toEqual(denied);
    expect(await setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: free.id, kind: "NOMINAL", value: 10_000, reason: "Pelanggan lama" })).toEqual(denied);
    expect(await setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 5, reason: "Ulang tahun" })).toEqual(denied);
    actor.role = "ADMIN_KEUANGAN";
    expect(await setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 30, reason: "Kompensasi" })).toEqual(denied);
    expect(await applyFinalDiscount({ invoiceId: final, kind: "NOMINAL", value: 10_000, reason: "Kompensasi" })).toEqual(denied);
    expect(await cancelInvoice({ invoiceId: final, reason: "Salah input" })).toEqual(denied);
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: final } })).toMatchObject({ status: "FINAL", discountKind: null });
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ unitPrice: 150_000, priceApprovedByName: null });
  });

  it("dengan PIN benar tersimpan bersama nama penyetuju dan audit '· disetujui'", async () => {
    const approval = await testApproval();
    const id = await draft();
    const final = await finalInvoice();
    const product = await lineOf(id, `${SLUG} Serum C`);
    const free = await lineOf(id, "Layanan PIN");
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 1, unitPrice: 140_000, priceNote: "Harga teman", approval }));
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: free.id, kind: "NOMINAL", value: 10_000, reason: "Pelanggan lama", approval }));
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 5, reason: "Ulang tahun", approval }));
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ unitPrice: 140_000, priceNote: "Harga teman", priceApprovedById: approval.approverId, priceApprovedByName: TEST_APPROVER_NAME });
    expect(await lineOf(id, "Layanan PIN")).toMatchObject({ discountAmount: 10_000, discountApprovedByName: TEST_APPROVER_NAME });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id } })).toMatchObject({ discountKind: "PERSEN", discountApprovedByName: TEST_APPROVER_NAME });
    // Empat: baris bebas di draf (P13), harga, diskon baris, dan diskon tagihan.
    expect(await prisma.auditLog.count({ where: { entityId: id, summary: { contains: `· disetujui ${TEST_APPROVER_NAME}` } } })).toBe(4);

    actor.role = "ADMIN_KEUANGAN";
    await unwrap(applyFinalDiscount({ invoiceId: final, kind: "NOMINAL", value: 10_000, reason: "Kompensasi", approval }));
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: final } })).toMatchObject({ discountValue: 10_000, discountApprovedByName: TEST_APPROVER_NAME });
    await unwrap(cancelInvoice({ invoiceId: final, reason: "Salah input", approval }));
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: final } })).toMatchObject({ status: "DIBATALKAN", cancelApprovedById: approval.approverId, cancelApprovedByName: TEST_APPROVER_NAME });
  });

  it("diskon 25% oleh resepsionis tetap ditolak batas 20% sebelum PIN diminta (spec P3)", async () => {
    const id = await draft();
    const free = await lineOf(id, "Layanan PIN");
    const overLimit = { ok: false, error: "Diskon di atas 20% diberikan oleh Admin Keuangan." };
    expect(await setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 25, reason: "Teman" })).toEqual(overLimit);
    expect(await setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: free.id, kind: "NOMINAL", value: 90_000, reason: "Teman" })).toEqual(overLimit);
  });

  it("ubah jumlah saja tanpa PIN, nama penyetuju harga tetap (Review Focus 4)", async () => {
    const approval = await testApproval();
    const id = await draft();
    const product = await lineOf(id, `${SLUG} Serum C`);
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 1, unitPrice: 140_000, priceNote: "Harga teman", approval }));
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 2, unitPrice: 140_000, priceNote: "" }));
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ quantity: 2, unitPrice: 140_000, priceNote: "Harga teman", priceApprovedByName: TEST_APPROVER_NAME });
  });

  it("kembali ke harga katalog, hapus diskon baris, dan hapus diskon tagihan tanpa PIN dan mengosongkan nama penyetuju (Review Focus 5)", async () => {
    const approval = await testApproval();
    const id = await draft();
    const product = await lineOf(id, `${SLUG} Serum C`);
    const free = await lineOf(id, "Layanan PIN");
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 1, unitPrice: 140_000, priceNote: "Harga teman", approval }));
    await unwrap(setLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: free.id, kind: "NOMINAL", value: 10_000, reason: "Pelanggan lama", approval }));
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 5, reason: "Ulang tahun", approval }));

    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: product.id, quantity: 1, unitPrice: 150_000, priceNote: "" }));
    await unwrap(clearLineDiscount({ invoiceId: id, version: await versionOf(id), lineId: free.id }));
    await unwrap(setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: null, value: 0, reason: "" }));
    expect(await lineOf(id, `${SLUG} Serum C`)).toMatchObject({ unitPrice: 150_000, priceNote: null, priceApprovedById: null, priceApprovedByName: null });
    expect(await lineOf(id, "Layanan PIN")).toMatchObject({ discountAmount: 0, discountApprovedById: null, discountApprovedByName: null });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id } })).toMatchObject({ discountKind: null, discountApprovedById: null, discountApprovedByName: null });
  });

  it("buang draf tanpa PIN; batalkan tagihan final butuh PIN (spec P4)", async () => {
    const id = await draft();
    await unwrap(cancelInvoice({ invoiceId: id, reason: "Tidak jadi" }));
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "DIBATALKAN", cancelApprovedByName: null });
  });

  it("baris bebas: menambah dan mengubah harganya wajib PIN; ubah jumlah saja tanpa PIN (keputusan pemilik A, spec P13)", async () => {
    const approval = await testApproval();
    const { id } = await unwrap(createDirectSale({ patientId: world.patientId, branchId: world.branchId }));
    const denied = { ok: false, error: APPROVAL_REQUIRED };
    expect(await addFreeLine({ invoiceId: id, version: 1, kind: "TREATMENT", name: "Facial bebas", quantity: 1, unitPrice: 250_000 })).toEqual(denied);
    expect(await prisma.invoiceLine.count({ where: { invoiceId: id } })).toBe(0);
    await unwrap(addFreeLine({ invoiceId: id, version: 1, kind: "TREATMENT", name: "Facial bebas", quantity: 1, unitPrice: 250_000, approval }));
    const line = await lineOf(id, "Facial bebas");
    expect(line).toMatchObject({ unitPrice: 250_000, priceApprovedById: approval.approverId, priceApprovedByName: TEST_APPROVER_NAME });

    expect(await updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 1, unitPrice: 200_000, priceNote: "" })).toEqual(denied);
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 1, unitPrice: 200_000, priceNote: "", approval }));
    await unwrap(updateInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 2, unitPrice: 200_000, priceNote: "" }));
    expect(await lineOf(id, "Facial bebas")).toMatchObject({ quantity: 2, unitPrice: 200_000, priceApprovedByName: TEST_APPROVER_NAME });
    expect(await prisma.auditLog.count({ where: { entityId: id, summary: { contains: `· disetujui ${TEST_APPROVER_NAME}` } } })).toBe(2);
  });

  it("PIN salah tidak menyimpan tindakan dan menambah hitungan salah", async () => {
    const approval = await testApproval();
    const id = await draft();
    expect(await setInvoiceDiscount({ invoiceId: id, version: await versionOf(id), kind: "PERSEN", value: 5, reason: "Ulang tahun", approval: { ...approval, pin: "000000" } })).toEqual({
      ok: false,
      error: PIN_WRONG,
    });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id } })).toMatchObject({ discountKind: null });
    expect((await prisma.approvalPin.findUniqueOrThrow({ where: { staffId: approval.approverId } })).failedCount).toBe(1);
  });
});
