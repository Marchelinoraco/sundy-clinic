import { prisma } from "@/lib/db";
import type { MedicineOption } from "@/lib/prescription";
import { stockFlags } from "@/lib/stock";
import { witaDateString } from "@/lib/time";

/**
 * Obat yang bisa diresepkan dokter di satu cabang (spec resep dokter 3): aktif dan berharga jual, beserta sisa stok cabang.
 * Harga beli dan jual sengaja tidak dipilih. `includeIds` = obat yang sudah ada di draf, tetap tampil walau sudah tak memenuhi.
 * Modul biasa: dipanggil dari bacaan kunjungan yang sudah memeriksa hak.
 */
export async function listPrescribableItems(branchId: string, includeIds: string[]): Promise<MedicineOption[]> {
  const today = witaDateString(new Date());
  const items = await prisma.stockItem.findMany({
    where: { OR: [{ isActive: true, sellPrice: { not: null } }, { id: { in: includeIds } }] },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      batches: { where: { branchId, quantityRemaining: { gt: 0 } }, select: { quantityRemaining: true, expiryDate: true } },
    },
  });
  return items.map(({ batches, ...item }) => ({ ...item, available: stockFlags(batches.map((b) => ({ ...b, unitCost: 0 })), 0, today).available }));
}
