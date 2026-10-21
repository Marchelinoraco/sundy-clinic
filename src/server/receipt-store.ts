import { prisma } from "@/lib/db";
import { packageLineNotes } from "@/server/package-store";

/**
 * Data tagihan untuk struk (spec struk WA 6). Modul biasa: pemanggil memeriksa hak atau kode tautan.
 * Nomor WA hanya untuk pesan panel; bentuk publik dibuat buildPublicReceipt yang memilih kolom satu per satu.
 */
export async function loadReceiptSource(invoiceId: string) {
  const invoice = await prisma.invoice.findUnique({
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
      lines: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, kind: true, name: true, quantity: true, unitPrice: true, discountAmount: true, discountSource: true, treatmentPackageId: true, patientPackageItemId: true, packageSourceLineId: true },
      },
      payments: { orderBy: { createdAt: "asc" }, select: { amount: true, method: true, paidAt: true, revokedAt: true } },
    },
  });
  if (!invoice) return null;
  // Keterangan paket hanya nama treatment, sesi, dan tanggal; tanpa data klinis (spec paket 11).
  const notes = await packageLineNotes(prisma, invoice.lines, { draft: invoice.status === "DRAF" });
  return { ...invoice, lines: invoice.lines.map((line) => ({ ...line, note: notes.get(line.id) ?? null })) };
}
