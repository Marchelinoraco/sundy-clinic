import { prisma } from "@/lib/db";

/**
 * Data tagihan untuk struk (spec struk WA 6). Modul biasa: pemanggil memeriksa hak atau kode tautan.
 * Nomor WA hanya untuk pesan panel; bentuk publik dibuat buildPublicReceipt yang memilih kolom satu per satu.
 */
export function loadReceiptSource(invoiceId: string) {
  return prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      number: true,
      status: true,
      receiptLinkVersion: true,
      finalizedAt: true,
      finalizedByName: true,
      discountKind: true,
      discountValue: true,
      patient: { select: { name: true, whatsapp: true } },
      branch: { select: { name: true, address: true } },
      lines: { orderBy: { sortOrder: "asc" }, select: { name: true, quantity: true, unitPrice: true, discountAmount: true } },
      payments: { orderBy: { createdAt: "asc" }, select: { amount: true, method: true, paidAt: true, revokedAt: true } },
    },
  });
}
