"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { buildPublicReceipt, receiptMessageText, type PublicReceipt } from "@/lib/receipt";
import { prisma } from "@/lib/db";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { recordAudit } from "@/server/audit";
import { receiptUrl } from "@/server/receipt-link-code";
import { loadReceiptSource } from "@/server/receipt-store";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

export type ReceiptMessage = { text: string; link: string | null };

const NOT_FOUND = "Tagihan tidak ditemukan.";
const FINAL_ONLY_RECEIPT = "Struk hanya untuk tagihan final.";
const FINAL_ONLY_LINK = "Tautan struk hanya untuk tagihan final.";

/** Pesan WA struk (spec 5): teks dan tautan wa.me ke nomor pasien; null bila nomornya tidak sah. */
export async function getReceiptMessage(invoiceId: string): Promise<ActionResult<ReceiptMessage>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const source = await loadReceiptSource(String(invoiceId ?? ""));
    if (!source) throw new UserFacingError(NOT_FOUND);
    const receipt = buildPublicReceipt(source);
    if (!receipt) throw new UserFacingError(FINAL_ONLY_RECEIPT);
    const text = receiptMessageText({
      customerName: receipt.customerName,
      number: receipt.number,
      total: receipt.total,
      balance: receipt.balance,
      url: receiptUrl(publicSiteUrl(), source.id, source.receiptLinkVersion),
    });
    // Tanpa kode tautan: audit tidak boleh menjadi jalan lain untuk membuka struk.
    await recordAudit({ actor, action: "invoice.receipt-link", entity: "Invoice", entityId: source.id, summary: receipt.number });
    return { text, link: buildWhatsAppLinkTo(source.patient.whatsapp, text) };
  });
}

/** "Ganti tautan" (spec S3): semua tautan struk lama tagihan ini langsung tidak berlaku. */
export async function resetReceiptLink(invoiceId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoice = await prisma.invoice.findUnique({ where: { id: String(invoiceId ?? "") }, select: { id: true, number: true, status: true } });
    if (!invoice) throw new UserFacingError(NOT_FOUND);
    if (invoice.status !== "FINAL") throw new UserFacingError(FINAL_ONLY_LINK);
    await prisma.invoice.update({ where: { id: invoice.id }, data: { receiptLinkVersion: { increment: 1 } } });
    await recordAudit({ actor, action: "invoice.receipt-link-reset", entity: "Invoice", entityId: invoice.id, summary: invoice.number ?? undefined });
  });
}

/** Catatan audit setiap struk dicetak ke printer (spec 7.1). Tidak menyimpan apa pun selain itu. */
export async function recordReceiptPrint(invoiceId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoice = await prisma.invoice.findUnique({ where: { id: String(invoiceId ?? "") }, select: { id: true, number: true, status: true } });
    if (!invoice) throw new UserFacingError(NOT_FOUND);
    if (invoice.status !== "FINAL") throw new UserFacingError(FINAL_ONLY_RECEIPT);
    await recordAudit({ actor, action: "invoice.receipt-print", entity: "Invoice", entityId: invoice.id, summary: invoice.number ?? undefined });
  });
}

/** Struk untuk dicetak dari panel (browser atau QZ Tray); null untuk draf dan dibatalkan. */
export async function getInvoiceReceipt(invoiceId: string): Promise<PublicReceipt | null> {
  await requireCapability("invoice:read");
  const source = await loadReceiptSource(String(invoiceId ?? ""));
  return source ? buildPublicReceipt(source) : null;
}
