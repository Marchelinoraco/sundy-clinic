"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { dateOnly, validatePurchase, validateReason, type PurchaseInput } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";
import { lockInvoice } from "@/server/stock-store";

const CANNOT_CANCEL =
  "Faktur tidak bisa dibatalkan karena sudah ada pembayaran, retur, atau stok yang terpakai. Koreksi lewat penyesuaian atau retur.";

function revalidatePurchase(invoiceId: string) {
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath("/admin/hutang");
  safeRevalidatePath("/admin");
  safeRevalidatePath(`/admin/stok/masuk/${invoiceId}`);
}

/**
 * Barang masuk dari faktur supplier (spec stok 5.2): faktur, satu batch per baris, dan jurnal
 * MASUK dibuat dalam satu transaksi. Hutang langsung terbentuk dari total faktur.
 */
export async function createPurchase(input: PurchaseInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const lines: unknown[] = Array.isArray(input?.lines) ? input.lines : [];
    const itemIds = lines.flatMap((line) =>
      typeof line === "object" && line !== null && typeof (line as { itemId?: unknown }).itemId === "string"
        ? [(line as { itemId: string }).itemId]
        : [],
    );
    const [items, supplier, branch] = await Promise.all([
      prisma.stockItem.findMany({ where: { id: { in: itemIds }, isActive: true }, select: { id: true, kind: true } }),
      typeof input?.supplierId === "string" && input.supplierId
        ? prisma.supplier.findUnique({ where: { id: input.supplierId }, select: { id: true, name: true, isActive: true } })
        : null,
      typeof input?.branchId === "string" && input.branchId
        ? prisma.branch.findUnique({ where: { id: input.branchId }, select: { id: true, status: true } })
        : null,
    ]);
    const kinds = new Map(items.map((item) => [item.id, item.kind]));
    const checked = validatePurchase(input, { today: witaDateString(new Date()), kindOf: (id) => kinds.get(id) ?? null });
    if (!checked.ok) throw new UserFacingError(checked.message);
    if (!supplier || !supplier.isActive) throw new UserFacingError("Pilih supplier yang aktif.");
    if (!branch || branch.status !== "AKTIF") throw new UserFacingError("Cabang ini belum bisa menerima barang.");
    const p = checked.value;

    let id: string;
    try {
      id = await prisma.$transaction(async (tx) => {
        const invoice = await tx.purchaseInvoice.create({
          data: {
            supplierId: supplier.id,
            branchId: branch.id,
            invoiceNumber: p.invoiceNumber,
            invoiceDate: dateOnly(p.invoiceDate),
            dueDate: dateOnly(p.dueDate),
            total: p.total,
            notes: p.notes,
            createdById: actor.staffId,
            createdByName: actor.name,
          },
          select: { id: true },
        });
        for (const [index, line] of p.lines.entries()) {
          const expiryDate = line.expiryDate ? dateOnly(line.expiryDate) : null;
          const created = await tx.purchaseLine.create({
            data: {
              invoiceId: invoice.id,
              itemId: line.itemId,
              quantity: line.quantity,
              unitCost: line.unitCost,
              batchNumber: line.batchNumber,
              expiryDate,
              sortOrder: index,
            },
            select: { id: true },
          });
          const batch = await tx.stockBatch.create({
            data: {
              itemId: line.itemId,
              branchId: branch.id,
              purchaseLineId: created.id,
              batchNumber: line.batchNumber,
              expiryDate,
              unitCost: line.unitCost,
              quantityReceived: line.quantity,
              quantityRemaining: line.quantity,
            },
            select: { id: true },
          });
          await tx.stockMovement.create({
            data: { batchId: batch.id, kind: "MASUK", quantity: line.quantity, staffId: actor.staffId, staffName: actor.name },
          });
        }
        return invoice.id;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new UserFacingError(`Faktur ${p.invoiceNumber} dari ${supplier.name} sudah tercatat.`);
      }
      throw error;
    }

    await recordAudit({
      actor,
      action: "purchase.create",
      entity: "PurchaseInvoice",
      entityId: id,
      summary: `${supplier.name} ${p.invoiceNumber}: ${p.lines.length} baris, ${formatRupiah(p.total)}`,
    });
    revalidatePurchase(id);
    return { id };
  });
}

/**
 * Batalkan faktur salah input (spec stok 6.4): hanya bila belum ada pembayaran aktif, retur,
 * atau stok yang terpakai. Sisa setiap batch ditarik lewat jurnal PENYESUAIAN; faktur tetap tercatat.
 */
export async function cancelPurchase(input: { invoiceId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:read");
    if (!can(actor.role, "stock:manage") && !can(actor.role, "payable:manage")) {
      throw new UserFacingError("Anda tidak berhak membatalkan faktur.");
    }
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.invoiceId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoice(tx, id);
      const invoice = await tx.purchaseInvoice.findUnique({
        where: { id },
        select: {
          invoiceNumber: true,
          cancelledAt: true,
          supplier: { select: { name: true } },
          _count: { select: { returns: true } },
          payments: { where: { revokedAt: null }, select: { id: true } },
          lines: {
            select: {
              batch: { select: { id: true, quantityReceived: true, quantityRemaining: true, _count: { select: { movements: true } } } },
            },
          },
        },
      });
      if (!invoice) throw new UserFacingError("Faktur tidak ditemukan.");
      if (invoice.cancelledAt) throw new UserFacingError("Faktur ini sudah dibatalkan.");
      const batches = invoice.lines.flatMap((line) => (line.batch ? [line.batch] : []));
      const intact =
        batches.length === invoice.lines.length &&
        batches.every((batch) => batch.quantityRemaining === batch.quantityReceived && batch._count.movements === 1);
      if (invoice.payments.length > 0 || invoice._count.returns > 0 || !intact) throw new UserFacingError(CANNOT_CANCEL);

      for (const batch of batches) {
        const { count } = await tx.stockBatch.updateMany({
          where: { id: batch.id, quantityRemaining: batch.quantityReceived },
          data: { quantityRemaining: 0 },
        });
        if (count !== 1) throw new UserFacingError(CANNOT_CANCEL);
        await tx.stockMovement.create({
          data: {
            batchId: batch.id,
            kind: "PENYESUAIAN",
            quantity: -batch.quantityReceived,
            reason: "LAINNYA",
            note: "Faktur dibatalkan",
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
      await tx.purchaseInvoice.update({
        where: { id },
        data: { cancelledAt: new Date(), cancelledByName: actor.name, cancelReason: reason.value },
      });
      return `${invoice.supplier.name} ${invoice.invoiceNumber}: ${reason.value}`;
    });

    await recordAudit({ actor, action: "purchase.cancel", entity: "PurchaseInvoice", entityId: id, summary });
    revalidatePurchase(id);
  });
}
