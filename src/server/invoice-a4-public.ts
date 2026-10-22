"use server";

import { runAction, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import type { PublicInvoicePage } from "@/lib/invoice-a4";
import { createRateLimiter } from "@/lib/rate-limit";
import { loadInvoiceA4 } from "@/server/invoice-a4-store";
import { isValidReceiptCode, parseReceiptCode } from "@/server/receipt-link-code";
import { guardRate } from "@/server/request-guard";

// Bisa dipanggil siapa pun tanpa login, dengan kode tautan struk yang sama (spec invoice A4 IA8). Semua kegagalan terlihat sama.

const invoiceLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const INVALID: PublicInvoicePage = { state: "INVALID" };

/** Isi halaman /invoice. Status "dibatalkan" hanya untuk kode yang sah (IA9). */
export async function getPublicInvoice(code: string): Promise<ActionResult<PublicInvoicePage>> {
  return runAction(async () => {
    await guardRate(invoiceLimiter);
    const parsed = parseReceiptCode(code);
    if (!parsed) return INVALID;
    const invoice = await prisma.invoice.findUnique({ where: { id: parsed.invoiceId }, select: { status: true, receiptLinkVersion: true } });
    if (!invoice || !isValidReceiptCode(code, invoice.receiptLinkVersion)) return INVALID;
    if (invoice.status === "DIBATALKAN") return { state: "CANCELLED" };
    const a4 = await loadInvoiceA4(parsed.invoiceId);
    return a4 ? { state: "VALID", invoice: a4 } : INVALID;
  });
}
