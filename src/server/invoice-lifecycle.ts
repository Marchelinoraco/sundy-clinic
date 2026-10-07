"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { fefoPlan, formatInvoiceNumber, invoiceTotals, type BatchStock } from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { formatRupiah } from "@/lib/format";
import { validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { lockInvoiceRow, nextInvoiceSequence, STALE_DRAFT, TOTALS_SELECT } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";
import { takeFromBatch } from "@/server/stock-store";

function revalidateLifecycle(invoiceId: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

type LiveBatch = BatchStock & { unitCost: number };

/**
 * Finalkan tagihan (spec tagihan 4.3), dalam satu transaksi: stok baris barang diambil dari
 * batch tercepat kedaluwarsa (FEFO) di cabang tagihan, jurnal KELUAR dan harga pokok dicatat,
 * nomor tagihan diberikan, dan baris dikunci. Stok kurang: seluruhnya batal, draf tetap utuh.
 */
export async function finalizeInvoice(input: { invoiceId: string; version: number }): Promise<ActionResult<{ number: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const now = new Date();
    const today = witaDateString(now);

    const result = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          version: true,
          branchId: true,
          branch: { select: { name: true } },
          ...TOTALS_SELECT,
          lines: { orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, name: true, itemId: true, quantity: true, unitPrice: true } },
        },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "DRAF") throw new UserFacingError("Tagihan ini sudah difinalkan atau dibatalkan. Muat ulang halaman.");
      if (invoice.version !== input.version) throw new UserFacingError(STALE_DRAFT);
      if (invoice.lines.length === 0) throw new UserFacingError("Tagihan kosong tidak bisa difinalkan. Tambahkan baris dulu.");

      // Stok tiap barang dimuat sekali dan dikurangi di memori setiap baris, supaya barang yang sama
      // di dua baris tidak memakai sisa yang sama dua kali.
      const live = new Map<string, LiveBatch[]>();
      for (const line of invoice.lines) {
        if (line.kind !== "BARANG" || !line.itemId || live.has(line.itemId)) continue;
        live.set(
          line.itemId,
          await tx.stockBatch.findMany({
            where: { itemId: line.itemId, branchId: invoice.branchId, quantityRemaining: { gt: 0 } },
            select: { id: true, quantityRemaining: true, expiryDate: true, createdAt: true, unitCost: true },
          }),
        );
      }

      for (const line of invoice.lines) {
        if (line.kind !== "BARANG" || !line.itemId) continue;
        const batches = live.get(line.itemId) ?? [];
        const plan = fefoPlan(batches, line.quantity, today);
        if (!plan.ok) {
          throw new UserFacingError(`Stok ${line.name} di ${invoice.branch.name} tidak cukup (tersedia ${plan.available}).`);
        }
        for (const take of plan.takes) {
          if (!(await takeFromBatch(tx, take.batchId, take.quantity))) {
            throw new UserFacingError("Stok berubah saat difinalkan. Muat ulang halaman lalu coba lagi.");
          }
          const batch = batches.find((b) => b.id === take.batchId)!;
          batch.quantityRemaining -= take.quantity;
          await tx.invoiceStockUse.create({ data: { lineId: line.id, batchId: batch.id, quantity: take.quantity, unitCost: batch.unitCost } });
          await tx.stockMovement.create({
            data: {
              batchId: batch.id,
              kind: "KELUAR",
              quantity: -take.quantity,
              invoiceId,
              staffId: actor.staffId,
              staffName: actor.name,
            },
          });
        }
      }

      const year = Number(today.slice(0, 4));
      const number = formatInvoiceNumber(year, await nextInvoiceSequence(tx, year));
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "FINAL", number, finalizedAt: now, finalizedByName: actor.name, version: { increment: 1 } },
      });
      return { number, total: invoiceTotals({ ...invoice, status: "FINAL" }).total };
    });

    await recordAudit({
      actor,
      action: "invoice.finalize",
      entity: "Invoice",
      entityId: invoiceId,
      summary: `${result.number}: ${formatRupiah(result.total)}`,
    });
    revalidateLifecycle(invoiceId);
    return { number: result.number };
  });
}

/**
 * Batalkan tagihan (spec tagihan 5), alasan wajib; tidak pernah dihapus. Draf dan final tanpa
 * pembayaran: invoice:manage atau invoice:correct. Yang pernah dibayar hanya invoice:correct, dan
 * pembayaran aktifnya harus dibatalkan lebih dulu. Stok yang terambil dikembalikan lewat jurnal.
 */
export async function cancelInvoice(input: { invoiceId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    const canCorrect = can(actor.role, "invoice:correct");
    if (!can(actor.role, "invoice:manage") && !canCorrect) throw new UserFacingError("Anda tidak berhak membatalkan tagihan.");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const invoiceId = String(input?.invoiceId ?? "");

    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          status: true,
          number: true,
          patient: { select: { name: true } },
          payments: { select: { revokedAt: true } },
          lines: { select: { stockUses: { select: { batchId: true, quantity: true } } } },
        },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status === "DIBATALKAN") throw new UserFacingError("Tagihan ini sudah dibatalkan.");
      if (invoice.payments.some((payment) => payment.revokedAt === null)) {
        throw new UserFacingError("Batalkan pembayarannya dulu (oleh Admin Keuangan), lalu batalkan tagihan.");
      }
      if (invoice.payments.length > 0 && !canCorrect) {
        throw new UserFacingError("Tagihan ini pernah dibayar. Pembatalan dilakukan oleh Admin Keuangan.");
      }

      for (const use of invoice.lines.flatMap((line) => line.stockUses)) {
        await tx.stockBatch.update({ where: { id: use.batchId }, data: { quantityRemaining: { increment: use.quantity } } });
        await tx.stockMovement.create({
          data: {
            batchId: use.batchId,
            kind: "PENYESUAIAN",
            quantity: use.quantity,
            reason: "LAINNYA",
            note: `Tagihan ${invoice.number} dibatalkan`,
            invoiceId,
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
      await tx.invoice.update({
        where: { id: invoiceId },
        data: { status: "DIBATALKAN", cancelledAt: new Date(), cancelledByName: actor.name, cancelReason: reason.value },
      });
      return `${invoice.number ?? "Draf"} ${invoice.patient.name}: ${reason.value}`;
    });

    await recordAudit({ actor, action: "invoice.cancel", entity: "Invoice", entityId: invoiceId, summary });
    revalidateLifecycle(invoiceId);
  });
}
