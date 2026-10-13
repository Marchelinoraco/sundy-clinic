"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { formatRupiah } from "@/lib/format";
import { can } from "@/lib/permissions";
import { safeRevalidatePath } from "@/lib/revalidate";
import {
  MAX_AMOUNT,
  STOCK_ITEM_KIND_LABEL,
  validateStockItem,
  validateSupplier,
  type StockItemInput,
  type SupplierInput,
} from "@/lib/stock";
import { promoLabel, validatePromo, type PromoInput } from "@/lib/stock-promo";
import { recordAudit } from "@/server/audit";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

const PRICE_BY_FINANCE = "Harga jual diisi Admin Keuangan.";

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
    if (!can(actor.role, "price:manage") && item.sellPrice !== null) throw new UserFacingError(PRICE_BY_FINANCE);
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

const priceText = (value: number | null) => (value === null ? "belum diisi" : formatRupiah(value));

export async function updateStockItem(id: string, input: StockItemInput): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("stock:manage");
    const checked = validateStockItem(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const item = checked.value;
    const existing = await prisma.stockItem.findUnique({ where: { id: String(id ?? "") }, select: { id: true, sellPrice: true } });
    if (!existing) throw new UserFacingError("Barang tidak ditemukan.");
    const priceAllowed = can(actor.role, "price:manage");
    if (!priceAllowed && item.sellPrice !== existing.sellPrice) throw new UserFacingError(PRICE_BY_FINANCE);
    try {
      await prisma.stockItem.update({ where: { id: existing.id }, data: priceAllowed ? item : { ...item, sellPrice: existing.sellPrice } });
    } catch (error) {
      if (isUniqueViolation(error)) throw new UserFacingError(`Kode barang ${item.code} sudah dipakai.`);
      throw error;
    }
    await recordAudit({ actor, action: "stock-item.update", entity: "StockItem", entityId: existing.id, summary: `${item.code} ${item.name}` });
    // Harga yang diubah Super Admin lewat formulir barang tetap tercatat sebagai perubahan harga (spec perbaikan tagihan 10).
    if (priceAllowed && item.sellPrice !== existing.sellPrice) {
      await recordAudit({
        actor,
        action: "stock-item.price",
        entity: "StockItem",
        entityId: existing.id,
        summary: `${item.code}: harga ${priceText(existing.sellPrice)} → ${priceText(item.sellPrice)}`,
      });
    }
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

/** Harga jual dan promo barang (spec perbaikan tagihan T9, 12a): hanya Admin Keuangan dan Super Admin. */
export async function setStockItemPrice(input: { itemId: string; sellPrice: number | null; promo: PromoInput }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("price:manage");
    const sellPrice = input?.sellPrice ?? null;
    if (sellPrice !== null && !(Number.isInteger(sellPrice) && sellPrice >= 0 && sellPrice <= MAX_AMOUNT)) throw new UserFacingError("Harga jual tidak sah.");
    const promo = validatePromo(input?.promo);
    if (!promo.ok) throw new UserFacingError(promo.message);
    const existing = await prisma.stockItem.findUnique({ where: { id: String(input?.itemId ?? "") }, select: { id: true, code: true, sellPrice: true } });
    if (!existing) throw new UserFacingError("Barang tidak ditemukan.");
    await prisma.stockItem.update({ where: { id: existing.id }, data: { sellPrice, ...promo.value } });
    await recordAudit({
      actor,
      action: "stock-item.price",
      entity: "StockItem",
      entityId: existing.id,
      summary: `${existing.code}: harga ${priceText(existing.sellPrice)} → ${priceText(sellPrice)}; ${promoLabel(promo.value) ?? "tanpa promo"}`,
    });
    revalidateStock(existing.id);
  });
}
