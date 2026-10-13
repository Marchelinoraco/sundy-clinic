"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { INVOICE_NOTES_MAX } from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { requireCapability } from "@/server/session";

/**
 * Catatan internal tagihan (spec perbaikan tagihan 6): draf, final, atau dibatalkan. Tidak menaikkan versi draf,
 * tidak pernah ikut struk. Audit hanya mencatat nomor tagihan (atau "draf"), tanpa isi catatan.
 */
export async function updateInvoiceNotes(input: { invoiceId: string; notes: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    if (!can(actor.role, "invoice:manage") && !can(actor.role, "invoice:correct")) throw new UserFacingError("Anda tidak berhak mengubah catatan tagihan.");
    const notes = typeof input?.notes === "string" ? input.notes.trim() : "";
    if (notes.length > INVOICE_NOTES_MAX) throw new UserFacingError(`Catatan paling banyak ${INVOICE_NOTES_MAX} karakter.`);
    const invoice = await prisma.invoice.findUnique({ where: { id: String(input?.invoiceId ?? "") }, select: { id: true, number: true } });
    if (!invoice) throw new UserFacingError("Tagihan tidak ditemukan.");
    await prisma.invoice.update({ where: { id: invoice.id }, data: { notes: notes || null } });
    await recordAudit({ actor, action: "invoice.notes", entity: "Invoice", entityId: invoice.id, summary: invoice.number ?? "draf" });
    safeRevalidatePath(`/admin/tagihan/${invoice.id}`);
  });
}
