"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { validateDispensingLine } from "@/lib/dispensing";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { touchDispensing } from "@/server/dispensing-store";
import { requireCapability } from "@/server/session";

type EditResult = ActionResult<{ version: number }>;

function revalidateDispensing(dispensingId: string) {
  safeRevalidatePath("/admin/resep");
  safeRevalidatePath(`/admin/resep/${dispensingId}`);
}

/** Tambah obat ke penyerahan Menunggu (spec penyerahan 4.2). Nama obat disalin dari katalog. */
export async function addDispensingLine(input: {
  dispensingId: string;
  version: number;
  itemId: string;
  quantity: number;
  usage: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const checked = validateDispensingLine(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const dispensingId = String(input.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDispensing(tx, dispensingId, input.version);
      const item = await tx.stockItem.findUnique({ where: { id: checked.value.itemId }, select: { name: true, isActive: true, sellPrice: true } });
      if (!item || !item.isActive || item.sellPrice === null) throw new UserFacingError("Obat tidak ditemukan atau tidak dijual.");
      const last = await tx.dispensingLine.aggregate({ where: { dispensingId }, _max: { sortOrder: true } });
      await tx.dispensingLine.create({
        data: {
          dispensingId,
          itemId: checked.value.itemId,
          itemName: item.name,
          quantity: checked.value.quantity,
          usage: checked.value.usage,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
      });
      return { version, summary: `Tambah ${item.name} ×${checked.value.quantity}` };
    });

    await recordAudit({ actor, action: "dispensing.update", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId);
    return { version: result.version };
  });
}

export async function updateDispensingLine(input: {
  dispensingId: string;
  version: number;
  lineId: string;
  quantity: number;
  usage: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDispensing(tx, dispensingId, input.version);
      const line = await tx.dispensingLine.findFirst({ where: { id: String(input.lineId ?? ""), dispensingId }, select: { id: true, itemId: true, itemName: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      const checked = validateDispensingLine({ itemId: line.itemId, quantity: input.quantity, usage: input.usage });
      if (!checked.ok) throw new UserFacingError(checked.message);
      await tx.dispensingLine.update({ where: { id: line.id }, data: { quantity: checked.value.quantity, usage: checked.value.usage } });
      return { version, summary: `Ubah ${line.itemName} ×${checked.value.quantity}` };
    });

    await recordAudit({ actor, action: "dispensing.update", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId);
    return { version: result.version };
  });
}

export async function removeDispensingLine(input: { dispensingId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("dispense:manage");
    const dispensingId = String(input.dispensingId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDispensing(tx, dispensingId, input.version);
      const line = await tx.dispensingLine.findFirst({ where: { id: String(input.lineId ?? ""), dispensingId }, select: { id: true, itemName: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      await tx.dispensingLine.delete({ where: { id: line.id } });
      return { version, summary: `Hapus ${line.itemName}` };
    });

    await recordAudit({ actor, action: "dispensing.update", entity: "Dispensing", entityId: dispensingId, summary: result.summary });
    revalidateDispensing(dispensingId);
    return { version: result.version };
  });
}
