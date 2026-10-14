import { prisma } from "@/lib/db";
import { counterState, type CounterFlag } from "@/lib/counter-stock";
import type { StockItemKindValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

/** Satu barang di meja resepsionis (spec stok meja 4.1). Sengaja tanpa sisa gudang, harga beli, dan nilai stok. */
export type CounterItemRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  kind: StockItemKindValue;
  available: number;
  expired: number;
  counterMinStock: number;
  flag: CounterFlag | null;
  /** Masih ada di permintaan restock yang menunggu di cabang ini. */
  requested: boolean;
};

export async function listCounterItems(branchId: string): Promise<CounterItemRow[]> {
  await requireCapability("counter:read");
  const today = witaDateString(new Date());
  const id = String(branchId ?? "");
  const [items, pending] = await Promise.all([
    prisma.stockItem.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        kind: true,
        counterMinStock: true,
        batches: { where: { branchId: id, counterRemaining: { gt: 0 } }, select: { counterRemaining: true, expiryDate: true } },
      },
    }),
    prisma.restockRequestLine.findMany({ where: { request: { branchId: id, status: "MENUNGGU" } }, select: { itemId: true } }),
  ]);
  const requested = new Set(pending.map((line) => line.itemId));
  return items.map(({ batches, ...item }) => {
    const state = counterState(batches, item.counterMinStock, today);
    return { ...item, available: state.available, expired: state.expired, flag: state.flag, requested: requested.has(item.id) };
  });
}

/** Lencana menu Stok meja (spec stok meja 4.1): barang aktif yang menipis atau habis di salah satu cabang aktif. */
export async function countCounterAlerts(): Promise<number> {
  await requireCapability("counter:read");
  const today = witaDateString(new Date());
  const [branches, items] = await Promise.all([
    prisma.branch.findMany({ where: { status: "AKTIF" }, select: { id: true } }),
    prisma.stockItem.findMany({
      where: { isActive: true, counterMinStock: { gt: 0 } },
      select: { counterMinStock: true, batches: { where: { counterRemaining: { gt: 0 } }, select: { branchId: true, counterRemaining: true, expiryDate: true } } },
    }),
  ]);
  let count = 0;
  for (const item of items) {
    const flagged = branches.some((branch) => counterState(item.batches.filter((b) => b.branchId === branch.id), item.counterMinStock, today).flag !== null);
    if (flagged) count += 1;
  }
  return count;
}
