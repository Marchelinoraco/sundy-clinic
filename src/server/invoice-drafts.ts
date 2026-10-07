"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  invoiceSubtotal,
  validateDiscount,
  validateFreeLine,
  validateItemAdd,
  validateLineEdit,
  visitLines,
  type FreeLineInput,
  type DiscountKindValue,
} from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isExclusionViolation } from "@/server/db-errors";
import { handedInvoiceLines, lockDispensingRow } from "@/server/dispensing-store";
import { guardDiscount, touchDraft } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";

const DISPENSED_QUANTITY = "Jumlah obat dari penyerahan tidak bisa diubah. Minta Apoteker membuka kembali penyerahan.";
const DISPENSED_REMOVE = "Obat dari penyerahan tidak bisa dihapus. Minta Apoteker membuka kembali penyerahan.";

function revalidateInvoices(invoiceId?: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  if (invoiceId) safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

/**
 * Buat tagihan dari kunjungan final (spec tagihan 4.2). Dua klik bersamaan menghasilkan satu
 * tagihan: yang kalah gagal di constraint eksklusi dan dibawa ke tagihan yang sudah ada.
 */
export async function createInvoiceFromVisit(appointmentId: string): Promise<ActionResult<{ id: string; existing: boolean }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const id = String(appointmentId ?? "");
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        patientId: true,
        branchId: true,
        channel: true,
        service: { select: { id: true, name: true, promoPrice: true } },
        encounter: { select: { status: true, treatments: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceId: true, serviceName: true } } } },
      },
    });
    if (!appointment) throw new UserFacingError("Kunjungan tidak ditemukan.");
    if (appointment.encounter?.status !== "FINAL") {
      throw new UserFacingError("Hanya kunjungan yang catatannya sudah final yang bisa ditagih.");
    }
    if (!appointment.patientId) throw new UserFacingError("Kunjungan ini belum dicocokkan dengan data pasien.");

    const findActive = () =>
      prisma.invoice.findFirst({ where: { appointmentId: id, status: { not: "DIBATALKAN" } }, select: { id: true } });
    const existing = await findActive();
    if (existing) return { id: existing.id, existing: true };

    const services = await prisma.service.findMany({
      where: { id: { in: appointment.encounter.treatments.map((t) => t.serviceId) } },
      select: { id: true, promoPrice: true },
    });
    const priceOf = new Map(services.map((service) => [service.id, service.promoPrice]));
    const lines = visitLines({
      online: appointment.channel === "ONLINE",
      service: appointment.service
        ? { id: appointment.service.id, name: appointment.service.name, price: appointment.service.promoPrice }
        : null,
      treatments: appointment.encounter.treatments.map((t) => ({
        id: t.id,
        serviceId: t.serviceId,
        name: t.serviceName,
        price: priceOf.get(t.serviceId) ?? null,
      })),
    });

    try {
      const created = await prisma.$transaction(async (tx) => {
        // Baris penyerahan dikunci dulu, supaya pembuatan tagihan dan penyelesaian penyerahan bergiliran
        // (spec penyerahan 4.3): yang kedua selalu melihat hasil yang pertama.
        const dispensing = await tx.dispensing.findUnique({ where: { appointmentId: id }, select: { id: true } });
        let handed: Awaited<ReturnType<typeof handedInvoiceLines>> = [];
        if (dispensing) {
          await lockDispensingRow(tx, dispensing.id);
          handed = await handedInvoiceLines(tx, dispensing.id);
        }
        const all = [...lines.map((line) => ({ ...line, dispensingLineId: null as string | null })), ...handed];
        return tx.invoice.create({
          data: {
            patientId: appointment.patientId!,
            appointmentId: id,
            branchId: appointment.branchId,
            createdById: actor.staffId,
            createdByName: actor.name,
            lines: { create: all.map((line, index) => ({ ...line, sortOrder: index })) },
          },
          select: { id: true },
        });
      });
      await recordAudit({
        actor,
        action: "invoice.create",
        entity: "Invoice",
        entityId: created.id,
        summary: `Draf dari kunjungan ${appointment.code}: ${lines.length} baris`,
      });
      revalidateInvoices(created.id);
      return { id: created.id, existing: false };
    } catch (error) {
      if (isExclusionViolation(error)) {
        const winner = await findActive();
        if (winner) return { id: winner.id, existing: true };
      }
      throw error;
    }
  });
}

/** Penjualan langsung (spec tagihan 4.1): draf tanpa kunjungan untuk pasien yang sudah ada. */
export async function createDirectSale(input: { patientId: string; branchId?: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, name: true, mergedInto: { select: { name: true, medicalRecordNumber: true } } },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    if (patient.mergedInto) {
      throw new UserFacingError(
        `Pasien ini rangkap dari ${patient.mergedInto.name} (${patient.mergedInto.medicalRecordNumber}). Buat tagihan untuk pasien itu.`,
      );
    }
    const branch = input.branchId
      ? await prisma.branch.findUnique({ where: { id: String(input.branchId) }, select: { id: true, status: true } })
      : await prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true, status: true } });
    if (!branch) throw new UserFacingError("Belum ada cabang aktif.");
    if (branch.status !== "AKTIF") throw new UserFacingError("Cabang ini belum menerima transaksi.");

    const created = await prisma.invoice.create({
      data: { patientId: patient.id, branchId: branch.id, createdById: actor.staffId, createdByName: actor.name },
      select: { id: true },
    });
    await recordAudit({
      actor,
      action: "invoice.create",
      entity: "Invoice",
      entityId: created.id,
      summary: `Draf penjualan langsung untuk ${patient.name}`,
    });
    revalidateInvoices(created.id);
    return { id: created.id };
  });
}

type EditResult = ActionResult<{ version: number }>;

async function nextSortOrder(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], invoiceId: string): Promise<number> {
  const last = await tx.invoiceLine.aggregate({ where: { invoiceId }, _max: { sortOrder: true } });
  return (last._max.sortOrder ?? -1) + 1;
}

/** Tambah barang dari katalog stok dengan harga jual saat ini (spec tagihan 4.2). */
export async function addInvoiceItem(input: { invoiceId: string; version: number; itemId: string; quantity: number }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateItemAdd(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const item = await tx.stockItem.findUnique({
        where: { id: checked.value.itemId },
        select: { id: true, name: true, isActive: true, sellPrice: true },
      });
      if (!item) throw new UserFacingError("Barang tidak ditemukan.");
      if (!item.isActive) throw new UserFacingError("Barang ini nonaktif.");
      if (item.sellPrice === null) throw new UserFacingError("Barang ini belum punya harga jual.");
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: {
            invoiceId,
            kind: "BARANG",
            name: item.name,
            quantity: checked.value.quantity,
            unitPrice: item.sellPrice!,
            itemId: item.id,
            sortOrder: await nextSortOrder(tx, invoiceId),
          },
        });
      });
      return { version, summary: `Tambah barang ${item.name} ×${checked.value.quantity}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Tambah baris bebas (layanan atau treatment yang tidak ada di katalog) dengan nama dan harga sendiri. */
export async function addFreeLine(input: { invoiceId: string; version: number } & FreeLineInput): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateFreeLine(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const invoiceId = String(input.invoiceId ?? "");
    const line = checked.value;

    const version = await prisma.$transaction(async (tx) => {
      const next = await touchDraft(tx, invoiceId, input.version);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: { invoiceId, kind: line.kind, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, sortOrder: await nextSortOrder(tx, invoiceId) },
        });
      });
      return next;
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Tambah baris ${line.name} ×${line.quantity}` });
    revalidateInvoices(invoiceId);
    return { version };
  });
}

/**
 * Ubah jumlah dan harga satu baris draf. Harga baris katalog yang diubah dari harga semula dan
 * dari harga katalog sekarang wajib catatan; mengembalikannya ke harga katalog menghapus catatan.
 */
export async function updateInvoiceLine(input: {
  invoiceId: string;
  version: number;
  lineId: string;
  quantity: number;
  unitPrice: number;
  priceNote: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: { id: true, name: true, quantity: true, unitPrice: true, priceNote: true, serviceId: true, itemId: true, dispensingLineId: true },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.dispensingLineId && input.quantity !== line.quantity) throw new UserFacingError(DISPENSED_QUANTITY);

      const catalogPrice = line.itemId
        ? (await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true } }))?.sellPrice ?? null
        : line.serviceId
          ? (await tx.service.findUnique({ where: { id: line.serviceId }, select: { promoPrice: true } }))?.promoPrice ?? null
          : null;
      const catalogLinked = line.itemId !== null || line.serviceId !== null;
      const price = typeof input.unitPrice === "number" ? input.unitPrice : Number.NaN;
      const needsNote = catalogLinked && price !== line.unitPrice && price !== (catalogPrice ?? line.unitPrice);
      const checked = validateLineEdit(input, { needsNote });
      if (!checked.ok) throw new UserFacingError(checked.message);

      const atCatalogPrice = catalogLinked && checked.value.unitPrice === (catalogPrice ?? line.unitPrice);
      const priceNote = atCatalogPrice ? null : (checked.value.priceNote ?? (checked.value.unitPrice === line.unitPrice ? line.priceNote : null));
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: { quantity: checked.value.quantity, unitPrice: checked.value.unitPrice, priceNote },
        });
      });
      return { version, summary: `Ubah baris ${line.name}: ×${checked.value.quantity}, Rp ${checked.value.unitPrice}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

export async function removeInvoiceLine(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true, dispensingLineId: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.dispensingLineId) throw new UserFacingError(DISPENSED_REMOVE);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.delete({ where: { id: line.id } });
      });
      return { version, summary: `Hapus baris ${line.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Menyalin ulang harga katalog saat ini ke baris katalog di draf (spec tagihan 4.2). Baris bebas tidak disentuh. */
export async function refreshCatalogPrices(input: { invoiceId: string; version: number }): Promise<ActionResult<{ version: number; updated: number }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const lines = await tx.invoiceLine.findMany({
        where: { invoiceId, OR: [{ itemId: { not: null } }, { serviceId: { not: null } }] },
        select: { id: true, unitPrice: true, itemId: true, serviceId: true },
      });
      let updated = 0;
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        for (const line of lines) {
          const price = line.itemId
            ? (await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true } }))?.sellPrice ?? null
            : (await tx.service.findUnique({ where: { id: line.serviceId! }, select: { promoPrice: true } }))?.promoPrice ?? null;
          if (price === null || price === line.unitPrice) continue;
          await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice: price, priceNote: null } });
          updated += 1;
        }
      });
      return { version, updated };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Segarkan harga katalog: ${result.updated} baris` });
    revalidateInvoices(invoiceId);
    return result;
  });
}

/**
 * Diskon draf (spec tagihan 3.2, TG9). Resepsionis sampai 20% dari subtotal; Admin Keuangan dan
 * Super Admin boleh lebih. Jenis kosong atau nilai 0 menghapus diskon.
 */
export async function setInvoiceDiscount(input: {
  invoiceId: string;
  version: number;
  kind: DiscountKindValue | null;
  value: number;
  reason: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    const canExceed = can(actor.role, "invoice:correct");
    if (!can(actor.role, "invoice:manage") && !canExceed) throw new UserFacingError("Anda tidak berhak mengubah diskon.");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, select: { quantity: true, unitPrice: true } });
      const checked = validateDiscount(input, { subtotal: invoiceSubtotal(lines), canExceed });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const discount = checked.value;
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          discountKind: discount.kind,
          discountValue: discount.value,
          discountReason: discount.reason,
          discountByName: discount.kind ? actor.name : null,
        },
      });
      return { version, summary: discount.kind ? `Diskon ${discount.value}${discount.kind === "PERSEN" ? "%" : ""}: ${discount.reason}` : "Diskon dihapus" };
    });

    await recordAudit({ actor, action: "invoice.discount", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
