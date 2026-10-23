"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { approvedSuffix, type ApprovalInput } from "@/lib/approval";
import { prisma } from "@/lib/db";
import { HOLD_MESSAGE } from "@/lib/dispensing";
import { lineCosts } from "@/lib/costing";
import { fefoPlan, formatInvoiceNumber, invoiceTotals, type BatchStock } from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { formatRupiah } from "@/lib/format";
import { validateReason } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { lockInvoiceRow, nextInvoiceSequence, STALE_DRAFT, TOTALS_SELECT } from "@/server/invoice-store";
import { applyDeposits, lockPatient, releaseDeposits } from "@/server/deposit-store";
import { activatePurchasedPackages, cancelPurchasedPackages, consumePackageSessions, restoreUsedSessions } from "@/server/package-store";
import { requireApprover, verifyApproval } from "@/server/approval";
import { requireCapability } from "@/server/session";
import { takeFromBatch } from "@/server/stock-store";

function revalidateLifecycle(invoiceId: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath("/admin/stok-meja");
  safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

type LiveBatch = BatchStock & { unitCost: number | null };

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
          appointmentId: true,
          patientId: true,
          branch: { select: { name: true } },
          ...TOTALS_SELECT,
          lines: { orderBy: { sortOrder: "asc" }, select: { id: true, kind: true, name: true, itemId: true, quantity: true, unitPrice: true, discountAmount: true, discountSource: true, treatmentPackageId: true, patientPackageItemId: true, packageSourceLineId: true, serviceId: true, performerId: true } },
        },
      });
      if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
      if (invoice.status !== "DRAF") throw new UserFacingError("Tagihan ini sudah difinalkan atau dibatalkan. Muat ulang halaman.");
      if (invoice.version !== input.version) throw new UserFacingError(STALE_DRAFT);
      // Pelaksana dipilih resepsionis di draf, termasuk untuk sesi paket, agar komisi tidak terlewat (spec aturan pakai PL3).
      const unassigned = invoice.lines.find((line) => line.kind === "TREATMENT" && line.performerId === null);
      if (unassigned) throw new UserFacingError(`Pilih pelaksana untuk ${unassigned.name}.`);
      // Penyerahan obat harus selesai lebih dulu (spec penyerahan 4.4); status dibaca setelah tagihan dikunci.
      if (invoice.appointmentId) {
        const hold = await tx.dispensing.findUnique({ where: { appointmentId: invoice.appointmentId }, select: { status: true } });
        if (hold?.status === "MENUNGGU") throw new UserFacingError(HOLD_MESSAGE);
      }
      if (invoice.lines.length === 0) throw new UserFacingError("Tagihan kosong tidak bisa difinalkan. Tambahkan baris dulu.");

      // Stok tiap barang dimuat sekali dan dikurangi di memori setiap baris, supaya barang yang sama
      // di dua baris tidak memakai sisa yang sama dua kali.
      const live = new Map<string, LiveBatch[]>();
      for (const line of invoice.lines) {
        if (line.kind !== "BARANG" || !line.itemId || live.has(line.itemId)) continue;
        // Tagihan mengambil stok meja resepsionis (spec stok meja SM1).
        const batches = await tx.stockBatch.findMany({
          where: { itemId: line.itemId, branchId: invoice.branchId, counterRemaining: { gt: 0 } },
          select: { id: true, counterRemaining: true, expiryDate: true, createdAt: true, unitCost: true },
        });
        live.set(
          line.itemId,
          batches.map(({ counterRemaining, ...batch }) => ({ ...batch, quantityRemaining: counterRemaining })),
        );
      }

      for (const line of invoice.lines) {
        if (line.kind !== "BARANG" || !line.itemId) continue;
        const batches = live.get(line.itemId) ?? [];
        const plan = fefoPlan(batches, line.quantity, today);
        if (!plan.ok) {
          throw new UserFacingError(`Stok meja ${line.name} di ${invoice.branch.name} tidak cukup (tersedia ${plan.available}). Minta restock ke Apoteker.`);
        }
        for (const take of plan.takes) {
          if (!(await takeFromBatch(tx, take.batchId, take.quantity, "MEJA"))) {
            throw new UserFacingError("Stok berubah saat difinalkan. Muat ulang halaman lalu coba lagi.");
          }
          const batch = batches.find((b) => b.id === take.batchId)!;
          batch.quantityRemaining -= take.quantity;
          // Dibaca sesudah batch terkunci: harga beli yang baru diisi Admin Keuangan selalu terbawa (spec harga modal 4).
          const unitCost = (await tx.stockBatch.findUniqueOrThrow({ where: { id: take.batchId }, select: { unitCost: true } })).unitCost;
          await tx.invoiceStockUse.create({ data: { lineId: line.id, batchId: batch.id, quantity: take.quantity, unitCost } });
          await tx.stockMovement.create({
            data: {
              batchId: batch.id,
              kind: "KELUAR",
              location: "MEJA",
              quantity: -take.quantity,
              invoiceId,
              staffId: actor.staffId,
              staffName: actor.name,
            },
          });
        }
      }

      // Salinan biaya dan komisi baris treatment (spec harga modal 6, M9–M10): dibaca dari katalog saat final.
      const treatmentLines = invoice.lines.filter((line) => line.kind === "TREATMENT" && line.serviceId);
      if (treatmentLines.length > 0) {
        const services = await tx.service.findMany({
          where: { id: { in: treatmentLines.map((line) => line.serviceId!) } },
          select: {
            id: true,
            promoPrice: true,
            materialCost: true,
            toolCost: true,
            commissionKind: true,
            commissionValue: true,
            costLines: { select: { name: true, amount: true } },
          },
        });
        for (const line of treatmentLines) {
          const service = services.find((s) => s.id === line.serviceId);
          const costs = lineCosts({ quantity: line.quantity, hasPerformer: line.performerId !== null, service: service ? { ...service, otherCosts: service.costLines } : null });
          await tx.invoiceLine.update({ where: { id: line.id }, data: costs });
        }
      }

      // Paket yang dijual menjadi milik customer dulu, supaya baris yang memakai paket baru itu bisa dipotong; lalu semua
      // sesi dan jatah barang yang dipakai dipotong, di transaksi yang sama (spec paket 5–6; paket barang PB3).
      const resolved = await activatePurchasedPackages(tx, { patientId: invoice.patientId, lines: invoice.lines }, actor, today);
      const uses = invoice.lines.map((line) => ({ ...line, patientPackageItemId: resolved.get(line.id) ?? line.patientPackageItemId }));
      await consumePackageSessions(tx, { patientId: invoice.patientId, lines: uses }, actor, today);

      // Deposit booking dan saldo pasien memotong tagihan saat difinalkan (spec deposit D1, D6, D8).
      await lockPatient(tx, invoice.patientId);
      await applyDeposits(
        tx,
        { id: invoiceId, patientId: invoice.patientId, appointmentId: invoice.appointmentId, total: invoiceTotals({ ...invoice, status: "FINAL" }).total },
        actor,
        today,
      );

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
/** Membuang draf tanpa PIN; membatalkan tagihan final wajib PIN persetujuan (spec PIN P1c, P4). */
export async function cancelInvoice(input: { invoiceId: string; reason: string; approval?: ApprovalInput }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    const canCorrect = can(actor.role, "invoice:correct");
    if (!can(actor.role, "invoice:manage") && !canCorrect) throw new UserFacingError("Anda tidak berhak membatalkan tagihan.");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const invoiceId = String(input?.invoiceId ?? "");
    const approver = await verifyApproval(input?.approval);

    const summary = await prisma.$transaction(async (tx) => {
      await lockInvoiceRow(tx, invoiceId);
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          status: true,
          number: true,
          appointmentId: true,
          patientId: true,
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
      const approvedBy = invoice.status === "FINAL" ? requireApprover(approver) : null;
      if (invoice.status === "FINAL") {
        // Saldo yang dipakai kembali ke pasien; saldo yang lahir dari tagihan ini ikut dihapus (spec deposit D12).
        await lockPatient(tx, invoice.patientId);
        await releaseDeposits(tx, invoiceId);
      }
      if (invoice.status === "FINAL") {
        // Pemakaian dikembalikan dulu, lalu paket yang dibeli di tagihan ini dibatalkan (spec paket 7).
        await restoreUsedSessions(tx, invoiceId, actor);
        await cancelPurchasedPackages(tx, invoiceId, actor);
      }

      for (const use of invoice.lines.flatMap((line) => line.stockUses)) {
        // Kembali ke lokasi tempat stok diambil: meja, atau gudang untuk tagihan sebelum stok meja (spec stok meja 3).
        const taken = await tx.stockMovement.findFirst({ where: { invoiceId, batchId: use.batchId, kind: "KELUAR" }, select: { location: true } });
        const location = taken?.location ?? "MEJA";
        await tx.stockBatch.update({
          where: { id: use.batchId },
          data: location === "MEJA" ? { counterRemaining: { increment: use.quantity } } : { quantityRemaining: { increment: use.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            batchId: use.batchId,
            kind: "PENYESUAIAN",
            location,
            quantity: use.quantity,
            reason: "LAINNYA",
            note: `Tagihan ${invoice.number} dibatalkan`,
            invoiceId,
            staffId: actor.staffId,
            staffName: actor.name,
          },
        });
      }
      // Baris asal penyerahan dilepas supaya penyerahan bisa ditagih lagi; penyerahan tagihan final kembali Menunggu
      // (spec penyerahan 4.6). Urutan kunci tetap tagihan → penyerahan.
      // Resep dokter: jumlah yang dikurangi resepsionis berlaku untuk tagihan ini saja; tagihan baru memakai resep asli,
      // dan penyerahannya tetap Selesai (spec resep dokter 4).
      if (invoice.appointmentId) {
        await tx.dispensingLine.updateMany({
          where: { dispensing: { appointmentId: invoice.appointmentId, source: "DOKTER" } },
          data: { billedQuantity: null, billingNote: null },
        });
      }
      await tx.invoiceLine.updateMany({ where: { invoiceId, dispensingLineId: { not: null } }, data: { dispensingLineId: null } });
      if (invoice.status === "FINAL" && invoice.appointmentId) {
        await tx.dispensing.updateMany({
          where: { appointmentId: invoice.appointmentId, source: "APOTEKER", status: { not: "MENUNGGU" } },
          data: { status: "MENUNGGU", completedAt: null, completedById: null, completedByName: null, version: { increment: 1 } },
        });
      }
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          status: "DIBATALKAN",
          cancelledAt: new Date(),
          cancelledByName: actor.name,
          cancelReason: reason.value,
          cancelApprovedById: approvedBy?.id ?? null,
          cancelApprovedByName: approvedBy?.name ?? null,
        },
      });
      return `${invoice.number ?? "Draf"} ${invoice.patient.name}: ${reason.value}${approvedSuffix(approvedBy?.name)}`;
    });

    await recordAudit({ actor, action: "invoice.cancel", entity: "Invoice", entityId: invoiceId, summary });
    revalidateLifecycle(invoiceId);
  });
}
