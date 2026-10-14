import { availableStock, type RestockStatusValue } from "@/lib/counter-stock";
import { prisma } from "@/lib/db";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type RestockRequestRow = {
  id: string;
  status: RestockStatusValue;
  version: number;
  branchId: string;
  branchName: string;
  note: string | null;
  requestedByName: string;
  createdAt: Date;
  decidedByName: string | null;
  decidedAt: Date | null;
  rejectReason: string | null;
  lines: { id: string; itemId: string; itemName: string; unit: string; requestedQuantity: number; sentQuantity: number | null }[];
};

const ROW_SELECT = {
  id: true,
  status: true,
  version: true,
  branchId: true,
  branch: { select: { name: true } },
  note: true,
  requestedByName: true,
  createdAt: true,
  decidedByName: true,
  decidedAt: true,
  rejectReason: true,
  lines: {
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, itemId: true, itemName: true, requestedQuantity: true, sentQuantity: true, item: { select: { unit: true } } },
  },
} as const;

type Raw = Awaited<ReturnType<typeof prisma.restockRequest.findMany<{ select: typeof ROW_SELECT }>>>[number];

function toRow(row: Raw): RestockRequestRow {
  const { branch, lines, ...rest } = row;
  return {
    ...rest,
    branchName: branch.name,
    lines: lines.map(({ item, ...line }) => ({ ...line, unit: item.unit })),
  };
}

/** Permintaan menunggu (terlama dulu) atau riwayat 50 terakhir (spec stok meja 4.1–4.2). Tanpa sisa gudang. */
export async function listRestockRequests(filter: { branchId?: string; view: "MENUNGGU" | "RIWAYAT" }): Promise<RestockRequestRow[]> {
  await requireCapability("counter:read");
  const branch = filter.branchId ? { branchId: filter.branchId } : {};
  const rows =
    filter.view === "MENUNGGU"
      ? await prisma.restockRequest.findMany({ where: { ...branch, status: "MENUNGGU" }, orderBy: { createdAt: "asc" }, select: ROW_SELECT })
      : await prisma.restockRequest.findMany({ where: { ...branch, status: { not: "MENUNGGU" } }, orderBy: { createdAt: "desc" }, take: 50, select: ROW_SELECT });
  return rows.map(toRow);
}

export type RestockRequestDetail = Omit<RestockRequestRow, "lines"> & {
  lines: (RestockRequestRow["lines"][number] & { warehouseAvailable: number })[];
};

/** Rincian untuk Apoteker (spec stok meja 4.2): tiap baris memuat sisa gudang tersedia cabang itu. */
export async function getRestockRequest(id: string): Promise<RestockRequestDetail | null> {
  await requireCapability("stock:manage");
  const row = await prisma.restockRequest.findUnique({ where: { id: String(id ?? "") }, select: ROW_SELECT });
  if (!row) return null;
  const base = toRow(row);
  const today = witaDateString(new Date());
  const batches = await prisma.stockBatch.findMany({
    where: { branchId: base.branchId, itemId: { in: base.lines.map((l) => l.itemId) }, quantityRemaining: { gt: 0 } },
    select: { itemId: true, quantityRemaining: true, counterRemaining: true, expiryDate: true },
  });
  return {
    ...base,
    lines: base.lines.map((line) => ({
      ...line,
      warehouseAvailable: availableStock(batches.filter((b) => b.itemId === line.itemId), today, "GUDANG"),
    })),
  };
}

/** Lencana tab Permintaan dan kotak dasbor Apoteker (spec stok meja 4.2, 6). */
export async function countPendingRestock(): Promise<number> {
  await requireCapability("stock:manage");
  return prisma.restockRequest.count({ where: { status: "MENUNGGU" } });
}
