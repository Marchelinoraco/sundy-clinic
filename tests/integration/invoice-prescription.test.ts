// @vitest-environment node
import type { StaffRole } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createInvoiceFromVisit, reducePrescriptionLine, removeInvoiceLine, restorePrescriptionLine, updateInvoiceLine } from "@/server/invoice-drafts";
import { cancelInvoice, finalizeInvoice } from "@/server/invoice-lifecycle";
import { getInvoiceDetail } from "@/server/invoice-read";
import { billingBatch, cleanupBillingWorld, createBillingWorld, finalVisit, seedDispensing, type BillingWorld } from "./invoice-world";
import { unwrap } from "./unwrap";
import { testApproval } from "./approver";

const { actor } = vi.hoisted(() => ({ actor: { userId: "u", staffId: "s", name: "Rina Resepsionis", role: "RESEPSIONIS" as StaffRole, email: "u@uji.test" } }));
vi.mock("@/server/session", async () => {
  const { can } = await import("@/lib/permissions");
  return {
    requireCapability: vi.fn(async (capability: Parameters<typeof can>[1]) => {
      if (!can(actor.role, capability)) throw new Error(`forbidden: ${capability}`);
      return actor;
    }),
  };
});

vi.mock("@/lib/revalidate", () => ({ safeRevalidatePath: vi.fn() }));

const SLUG = "tagih-resep";
const WA = "6281200009732";
let world: BillingWorld;
const versionOf = async (id: string) => (await prisma.invoice.findUniqueOrThrow({ where: { id } })).version;

/** Kunjungan final dengan penyerahan dari dokter berisi satu baris obat (10 kapsul). */
async function doctorVisit() {
  const { appointmentId } = await finalVisit(world, { treatments: [] });
  const { id, lineIds } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 10, usage: "3 x 1 sesudah makan" }] });
  await prisma.dispensing.update({ where: { id }, data: { source: "DOKTER" } });
  return { appointmentId, dispensingLineId: lineIds[0] };
}

beforeAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  world = await createBillingWorld(SLUG, WA);
  await billingBatch(world, { invoiceNumber: `${SLUG}-F1`, itemId: world.drugId, quantity: 50 });
});
beforeEach(() => {
  actor.role = "RESEPSIONIS";
});
afterAll(async () => {
  await cleanupBillingWorld(SLUG, [WA]);
  await prisma.$disconnect();
});

describe("baris resep dokter di tagihan (spec resep dokter 4)", () => {
  it("terisi saat tagihan dibuat; bisa dikurangi dengan alasan; keterangan tersimpan untuk dokter", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const detail = (await getInvoiceDetail(id))!;
    const line = detail.lines.find((l) => l.prescription)!;
    expect(line).toMatchObject({ quantity: 10, prescription: { prescribedQuantity: 10, usage: "3 x 1 sesudah makan" } });
    expect(detail.hasPrescription).toBe(true);

    expect(await reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 11, reason: "x" })).toEqual({ ok: false, error: "Jumlah ditagih harus 0–10." });
    expect(await reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 5, reason: "" })).toEqual({ ok: false, error: "Alasan 2–200 karakter." });
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 5, reason: "Stok kurang" }));
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).quantity).toBe(5);
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).toMatchObject({ billedQuantity: 5, billingNote: "Stok kurang" });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "invoice.update" }, orderBy: { createdAt: "desc" } })).summary).toBe(
      `Kurangi ${SLUG} Amoxicillin: ×5 dari 10 — Stok kurang`,
    );
  });

  it("jumlah 0 menghapus baris; ubah jumlah atau hapus biasa diarahkan ke Kurangi", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = (await getInvoiceDetail(id))!.lines.find((l) => l.prescription)!;
    expect(await updateInvoiceLine({ approval: await testApproval(), invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 3, unitPrice: line.unitPrice, priceNote: "" })).toEqual({
      ok: false,
      error: "Jumlah obat dari resep dokter diubah lewat tombol Kurangi.",
    });
    expect(await removeInvoiceLine({ invoiceId: id, version: await versionOf(id), lineId: line.id })).toEqual({
      ok: false,
      error: "Obat dari resep dokter dihapus lewat tombol Kurangi (jumlah 0) dengan alasan.",
    });
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 0, reason: "Customer menolak" }));
    expect(await prisma.invoiceLine.findUnique({ where: { id: line.id } })).toBeNull();
    expect((await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).billedQuantity).toBe(0);
  });

  it("pengurangan bisa dibatalkan: isi jumlah resep lagi, tanpa alasan, keterangan untuk dokter hilang", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = (await getInvoiceDetail(id))!.lines.find((l) => l.prescription)!;
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 5, reason: "Stok kurang" }));
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 10, reason: "" }));
    expect((await prisma.invoiceLine.findUniqueOrThrow({ where: { id: line.id } })).quantity).toBe(10);
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).toMatchObject({ billedQuantity: null, billingNote: null });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "invoice.update" }, orderBy: { createdAt: "desc" } })).summary).toBe(
      `Kembalikan ${SLUG} Amoxicillin ke jumlah resep (10)`,
    );
  });

  it("obat yang dijadikan 0 tampil sebagai tidak ditagih dan bisa dikembalikan dengan jumlah resep", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const before = (await getInvoiceDetail(id))!;
    expect(before.dispensingSource).toBe("DOKTER");
    expect(before.droppedPrescriptions).toEqual([]);
    const line = before.lines.find((l) => l.prescription)!;
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 0, reason: "Pasien menolak" }));
    expect((await getInvoiceDetail(id))!.droppedPrescriptions).toEqual([
      { dispensingLineId, name: `${SLUG} Amoxicillin`, prescribedQuantity: 10, reason: "Pasien menolak" },
    ]);

    await unwrap(restorePrescriptionLine({ invoiceId: id, version: await versionOf(id), dispensingLineId }));
    const after = (await getInvoiceDetail(id))!;
    expect(after.droppedPrescriptions).toEqual([]);
    expect(after.lines.find((l) => l.prescription)).toMatchObject({ quantity: 10, unitPrice: 2000, prescription: { prescribedQuantity: 10 } });
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).toMatchObject({ billedQuantity: null, billingNote: null });
    expect((await prisma.auditLog.findFirstOrThrow({ where: { entityId: id, action: "invoice.update" }, orderBy: { createdAt: "desc" } })).summary).toBe(
      `Kembalikan ${SLUG} Amoxicillin: ×10`,
    );
    expect(await restorePrescriptionLine({ invoiceId: id, version: await versionOf(id), dispensingLineId })).toEqual({
      ok: false,
      error: "Obat ini sudah ada di tagihan.",
    });
  });

  it("Kembalikan hanya untuk obat resep dokter kunjungan ini; Admin Keuangan tidak berhak", async () => {
    const { appointmentId } = await finalVisit(world, { treatments: [] });
    const { lineIds } = await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 2 }] });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    expect((await getInvoiceDetail(id))!.dispensingSource).toBe("APOTEKER");
    expect(await restorePrescriptionLine({ invoiceId: id, version: await versionOf(id), dispensingLineId: lineIds[0] })).toEqual({
      ok: false,
      error: "Obat resep tidak ditemukan. Muat ulang halaman.",
    });
    const other = await doctorVisit();
    expect(await restorePrescriptionLine({ invoiceId: id, version: await versionOf(id), dispensingLineId: other.dispensingLineId })).toEqual({
      ok: false,
      error: "Obat resep tidak ditemukan. Muat ulang halaman.",
    });
    actor.role = "ADMIN_KEUANGAN";
    await expect(restorePrescriptionLine({ invoiceId: id, version: await versionOf(id), dispensingLineId: lineIds[0] })).rejects.toThrow("forbidden: invoice:manage");
  });

  it("baris penyerahan Apoteker lama tidak bisa dikurangi lewat aksi resep (Review Focus 4)", async () => {
    const { appointmentId } = await finalVisit(world, { treatments: [] });
    await seedDispensing(world, appointmentId, { status: "SELESAI", lines: [{ itemId: world.drugId, quantity: 2 }] });
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = (await getInvoiceDetail(id))!.lines.find((l) => l.fromDispensing)!;
    expect(line.prescription).toBeNull();
    expect(await reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 1, reason: "Stok" })).toEqual({
      ok: false,
      error: "Hanya baris dari resep dokter yang bisa dikurangi di sini.",
    });
  });

  it("pembatalan tagihan: penyerahan dokter tetap Selesai dan tagihan baru berisi jumlah resep asli (Review Focus 2)", async () => {
    const { appointmentId, dispensingLineId } = await doctorVisit();
    const { id } = await unwrap(createInvoiceFromVisit(appointmentId));
    const line = (await getInvoiceDetail(id))!.lines.find((l) => l.prescription)!;
    await unwrap(reducePrescriptionLine({ invoiceId: id, version: await versionOf(id), lineId: line.id, quantity: 4, reason: "Stok kurang" }));
    await unwrap(finalizeInvoice({ invoiceId: id, version: await versionOf(id) }));
    actor.role = "SUPER_ADMIN";
    await unwrap(cancelInvoice({ approval: await testApproval(), invoiceId: id, reason: "Salah pasien" }));
    actor.role = "RESEPSIONIS";

    expect((await prisma.dispensing.findUniqueOrThrow({ where: { appointmentId } })).status).toBe("SELESAI");
    expect(await prisma.dispensingLine.findUniqueOrThrow({ where: { id: dispensingLineId } })).toMatchObject({ billedQuantity: null, billingNote: null });
    const again = await unwrap(createInvoiceFromVisit(appointmentId));
    expect((await getInvoiceDetail(again.id))!.lines.find((l) => l.prescription)!.quantity).toBe(10);
  });
});
