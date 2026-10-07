import { prisma } from "@/lib/db";
import { stockFlags, type StockItemKindValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

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
        where: { branchId: String(filter.branchId ?? ""), quantityRemaining: { gt: 0 } },
        select: { quantityRemaining: true, expiryDate: true },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    kind: item.kind,
    unit: item.unit,
    available: stockFlags(item.batches.map((b) => ({ ...b, unitCost: 0 })), 0, today).available,
  }));
}
