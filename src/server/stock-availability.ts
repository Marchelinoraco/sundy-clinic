import { prisma } from "@/lib/db";
import { availableStock } from "@/lib/counter-stock";
import type { StockItemKindValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { HAS_STOCK } from "@/server/stock-store";

export type AvailabilityRow = { id: string; name: string; kind: StockItemKindValue; unit: string; available: number };

/**
 * Ketersediaan stok untuk Dokter (spec penyerahan 5–6): hanya nama, jenis, satuan, dan sisa tersedia
 * (batch kedaluwarsa tidak dihitung). Harga beli, harga jual, dan batch sengaja tidak dipilih dari basis data.
 */
export async function listStockAvailability(filter: { branchId: string; q?: string }): Promise<AvailabilityRow[]> {
  await requireCapability("stock:availability");
  const today = witaDateString(new Date());
  const q = filter.q?.trim();
  const items = await prisma.stockItem.findMany({
    where: {
      isActive: true,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q.toUpperCase() } }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      kind: true,
      unit: true,
      batches: {
        where: { branchId: String(filter.branchId ?? ""), ...HAS_STOCK },
        select: { quantityRemaining: true, counterRemaining: true, expiryDate: true },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    // Gudang + meja (spec stok meja 6): Apoteker bisa mengisi meja kapan saja.
    available: availableStock(item.batches, today, "SEMUA"),
  }));
}
