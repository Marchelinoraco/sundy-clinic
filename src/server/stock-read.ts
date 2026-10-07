import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  dateOnlyString,
  flagsOf,
  payableSummary,
  stockFlags,
  type AdjustReasonValue,
  type StockFlag,
  type StockFlags,
  type StockItemKindValue,
  type StockMovementKindValue,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { PAYABLE_SELECT } from "@/server/stock-store";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type StockListFilter = { branchId: string; kind?: StockItemKindValue; flag?: StockFlag | "NONAKTIF"; q?: string };

export type StockItemRow = StockFlags & {
  id: string;
  code: string;
  name: string;
  kind: StockItemKindValue;
  unit: string;
  sellPrice: number | null;
  minStock: number;
  isActive: boolean;
  flags: StockFlag[];
};

const BATCH_STOCK_SELECT = { quantityRemaining: true, expiryDate: true, unitCost: true } as const;

/** Daftar barang satu cabang (spec stok 5.1). Bawaannya barang aktif; "NONAKTIF" menampilkan yang nonaktif. */
export async function listStockItems(filter: StockListFilter): Promise<StockItemRow[]> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const q = filter.q?.trim();
  const items = await prisma.stockItem.findMany({
    where: {
      isActive: filter.flag !== "NONAKTIF",
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { code: { contains: q.toUpperCase() } }] } : {}),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      unit: true,
      sellPrice: true,
      minStock: true,
      isActive: true,
      batches: { where: { branchId: filter.branchId, quantityRemaining: { gt: 0 } }, select: BATCH_STOCK_SELECT },
    },
  });
  const rows = items.map(({ batches, ...item }) => {
    const flags = stockFlags(batches, item.minStock, today);
    return { ...item, ...flags, flags: flagsOf(flags) };
  });
  const flag = filter.flag;
  return flag && flag !== "NONAKTIF" ? rows.filter((row) => row.flags.includes(flag)) : rows;
}

export type StockBatchRow = {
  id: string;
  branchName: string;
  batchNumber: string | null;
  expiryDate: string | null;
  expired: boolean;
  unitCost: number;
  quantityReceived: number;
  quantityRemaining: number;
  invoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  invoiceCancelled: boolean;
};

export type StockMovementRow = {
  id: string;
  createdAt: Date;
  kind: StockMovementKindValue;
  quantity: number;
  reason: AdjustReasonValue | null;
  note: string | null;
  staffName: string;
  batchNumber: string | null;
  branchName: string;
};

export type StockItemDetail = {
  item: {
    id: string;
    code: string;
    name: string;
    kind: StockItemKindValue;
    unit: string;
    sellPrice: number | null;
    minStock: number;
    isActive: boolean;
    notes: string | null;
  };
  batches: StockBatchRow[];
  movements: StockMovementRow[];
};

/** Detail barang (spec stok 5.3): batch bersisa di semua cabang, kedaluwarsa terdekat dulu, dan 100 jurnal terakhir. */
export async function getStockItemDetail(id: string): Promise<StockItemDetail | null> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const item = await prisma.stockItem.findUnique({
    where: { id: String(id ?? "") },
    select: { id: true, code: true, name: true, kind: true, unit: true, sellPrice: true, minStock: true, isActive: true, notes: true },
  });
  if (!item) return null;
  const [batches, movements] = await Promise.all([
    prisma.stockBatch.findMany({
      where: { itemId: item.id, quantityRemaining: { gt: 0 } },
      orderBy: [{ branch: { sortOrder: "asc" } }, { expiryDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        batchNumber: true,
        expiryDate: true,
        unitCost: true,
        quantityReceived: true,
        quantityRemaining: true,
        branch: { select: { name: true } },
        purchaseLine: {
          select: { invoice: { select: { id: true, invoiceNumber: true, cancelledAt: true, supplier: { select: { name: true } } } } },
        },
      },
    }),
    prisma.stockMovement.findMany({
      where: { batch: { itemId: item.id } },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        createdAt: true,
        kind: true,
        quantity: true,
        reason: true,
        note: true,
        staffName: true,
        batch: { select: { batchNumber: true, branch: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    item,
    batches: batches.map((batch) => {
      const expiryDate = batch.expiryDate ? dateOnlyString(batch.expiryDate) : null;
      const invoice = batch.purchaseLine.invoice;
      return {
        id: batch.id,
        branchName: batch.branch.name,
        batchNumber: batch.batchNumber,
        expiryDate,
        expired: expiryDate !== null && expiryDate < today,
        unitCost: batch.unitCost,
        quantityReceived: batch.quantityReceived,
        quantityRemaining: batch.quantityRemaining,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierName: invoice.supplier.name,
        invoiceCancelled: invoice.cancelledAt !== null,
      };
    }),
    movements: movements.map((movement) => ({
      id: movement.id,
      createdAt: movement.createdAt,
      kind: movement.kind,
      quantity: movement.quantity,
      reason: movement.reason,
      note: movement.note,
      staffName: movement.staffName,
      batchNumber: movement.batch.batchNumber,
      branchName: movement.batch.branch.name,
    })),
  };
}

export type SupplierRow = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  /** Sisa hutang (tanpa kredit); null bila pengguna tidak memegang payable:manage (spec stok 5.6). */
  balance: number | null;
};

export async function listSuppliers(): Promise<SupplierRow[]> {
  const actor = await requireCapability("stock:read");
  const withBalance = can(actor.role, "payable:manage");
  const today = witaDateString(new Date());
  const suppliers = await prisma.supplier.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: { id: true, name: true, phone: true, address: true, notes: true, isActive: true },
  });
  if (!withBalance) return suppliers.map((supplier) => ({ ...supplier, balance: null }));

  const invoices = await prisma.purchaseInvoice.findMany({ select: { supplierId: true, ...PAYABLE_SELECT } });
  const balances = new Map<string, number>();
  for (const invoice of invoices) {
    const owed = Math.max(payableSummary(invoice, today).balance, 0);
    balances.set(invoice.supplierId, (balances.get(invoice.supplierId) ?? 0) + owed);
  }
  return suppliers.map((supplier) => ({ ...supplier, balance: balances.get(supplier.id) ?? 0 }));
}

export type StockItemOption = { id: string; code: string; name: string; unit: string; kind: StockItemKindValue };
export type SupplierOption = { id: string; name: string };

/** Barang aktif untuk formulir barang masuk. */
export async function listStockItemOptions(): Promise<StockItemOption[]> {
  await requireCapability("stock:manage");
  return prisma.stockItem.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, code: true, name: true, unit: true, kind: true },
  });
}

/** Supplier aktif untuk formulir barang masuk. */
export async function listSupplierOptions(): Promise<SupplierOption[]> {
  await requireCapability("stock:manage");
  return prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } });
}

/** Kotak Stok di dasbor (spec stok 8): barang aktif yang bertanda di salah satu cabang aktif. */
export async function countStockAlerts(): Promise<{ low: number; expiringSoon: number; expired: number }> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const [branches, items] = await Promise.all([
    prisma.branch.findMany({ where: { status: "AKTIF" }, select: { id: true } }),
    prisma.stockItem.findMany({
      where: { isActive: true },
      select: {
        minStock: true,
        batches: { where: { quantityRemaining: { gt: 0 } }, select: { ...BATCH_STOCK_SELECT, branchId: true } },
      },
    }),
  ]);
  const counts = { low: 0, expiringSoon: 0, expired: 0 };
  for (const item of items) {
    const perBranch = branches.map((branch) =>
      stockFlags(
        item.batches.filter((batch) => batch.branchId === branch.id),
        item.minStock,
        today,
      ),
    );
    if (perBranch.some((flags) => flags.low)) counts.low += 1;
    if (perBranch.some((flags) => flags.expiringSoon)) counts.expiringSoon += 1;
    if (perBranch.some((flags) => flags.expired)) counts.expired += 1;
  }
  return counts;
}
