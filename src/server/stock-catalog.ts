"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import {
  STOCK_ITEM_KIND_LABEL,
  validateStockItem,
  validateSupplier,
  type StockItemInput,
  type SupplierInput,
} from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

function revalidateStock(itemId?: string) {
  safeRevalidatePath("/admin/stok");
  safeRevalidatePath("/admin");
  if (itemId) safeRevalidatePath(`/admin/stok/barang/${itemId}`);
}

/** Barang baru (spec stok 5.1). Kode unik; pesan galat menyebut kodenya. */
export async function createStockItem(input: StockItemInput): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateStockItem(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const item = checked.value;
    let id: string;
    try {
      id = (await prisma.stockItem.create({ data: item, select: { id: true } })).id;
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError(`Kode barang ${item.code} sudah dipakai.`);
      throw error;
    }
    await recordAudit({
      actor,
      action: "stock-item.create",
      entity: "StockItem",
      entityId: id,
      summary: `${item.code} ${item.name} (${STOCK_ITEM_KIND_LABEL[item.kind]})`,
    });
    revalidateStock();
    return { id };
  });
}

export async function updateStockItem(id: string, input: StockItemInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateStockItem(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const item = checked.value;
    const existing = await prisma.stockItem.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Barang tidak ditemukan.");
    try {
      await prisma.stockItem.update({ where: { id: existing.id }, data: item });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError(`Kode barang ${item.code} sudah dipakai.`);
      throw error;
    }
    await recordAudit({ actor, action: "stock-item.update", entity: "StockItem", entityId: existing.id, summary: `${item.code} ${item.name}` });
    revalidateStock(existing.id);
  });
}

/** Barang tidak pernah dihapus: riwayat stoknya harus tetap ada (spec stok 5.1). */
export async function setStockItemActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const existing = await prisma.stockItem.findUnique({ where: { id: String(id ?? "") }, select: { id: true, code: true } });
    if (!existing) throw new UserFacingError("Barang tidak ditemukan.");
    await prisma.stockItem.update({ where: { id: existing.id }, data: { isActive: active === true } });
    await recordAudit({
      actor,
      action: "stock-item.update",
      entity: "StockItem",
      entityId: existing.id,
      summary: `${existing.code}: ${active === true ? "diaktifkan" : "dinonaktifkan"}`,
    });
    revalidateStock(existing.id);
  });
}

export async function createSupplier(input: SupplierInput): Promise<ActionResult<{ id: string; name: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateSupplier(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const created = await prisma.supplier.create({ data: checked.value, select: { id: true, name: true } });
    await recordAudit({ actor, action: "supplier.create", entity: "Supplier", entityId: created.id, summary: created.name });
    safeRevalidatePath("/admin/stok");
    return created;
  });
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateSupplier(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const existing = await prisma.supplier.findUnique({ where: { id: String(id ?? "") }, select: { id: true } });
    if (!existing) throw new UserFacingError("Supplier tidak ditemukan.");
    await prisma.supplier.update({ where: { id: existing.id }, data: checked.value });
    await recordAudit({ actor, action: "supplier.update", entity: "Supplier", entityId: existing.id, summary: checked.value.name });
    safeRevalidatePath("/admin/stok");
    safeRevalidatePath("/admin/hutang");
  });
}

/** Supplier nonaktif tidak bisa dipilih untuk barang masuk baru; faktur dan hutangnya tetap tampil. */
export async function setSupplierActive(id: string, active: boolean): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const existing = await prisma.supplier.findUnique({ where: { id: String(id ?? "") }, select: { id: true, name: true } });
    if (!existing) throw new UserFacingError("Supplier tidak ditemukan.");
    await prisma.supplier.update({ where: { id: existing.id }, data: { isActive: active === true } });
    await recordAudit({
      actor,
      action: "supplier.update",
      entity: "Supplier",
      entityId: existing.id,
      summary: `${existing.name}: ${active === true ? "diaktifkan" : "dinonaktifkan"}`,
    });
    safeRevalidatePath("/admin/stok");
  });
}
