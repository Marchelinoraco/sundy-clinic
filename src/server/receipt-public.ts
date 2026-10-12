"use server";

import { runAction, type ActionResult } from "@/lib/action-result";
import { createRateLimiter } from "@/lib/rate-limit";
import { buildPublicReceipt, type PublicReceiptPage } from "@/lib/receipt";
import { isValidReceiptCode, parseReceiptCode } from "@/server/receipt-link-code";
import { loadReceiptSource } from "@/server/receipt-store";
import { guardRate } from "@/server/request-guard";

// Bisa dipanggil siapa pun tanpa login. Kode tautan satu-satunya bukti; semua kegagalan terlihat sama.

const receiptLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const INVALID: PublicReceiptPage = { state: "INVALID" };

/** Isi halaman /struk (spec 6). Status "dibatalkan" hanya untuk kode yang sah. */
export async function getPublicReceipt(code: string): Promise<ActionResult<PublicReceiptPage>> {
  return runAction(async () => {
    await guardRate(receiptLimiter);
    const parsed = parseReceiptCode(code);
    if (!parsed) return INVALID;
    const source = await loadReceiptSource(parsed.invoiceId);
    if (!source || !isValidReceiptCode(code, source.receiptLinkVersion)) return INVALID;
    if (source.status === "DIBATALKAN") return { state: "CANCELLED" };
    const receipt = buildPublicReceipt(source);
    return receipt ? { state: "VALID", receipt } : INVALID;
  });
}
