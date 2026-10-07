import { prisma } from "@/lib/db";
import {
  comparePayables,
  dateOnlyString,
  matchesPayableView,
  payableSummary,
  type PayableStatus,
  type PayableView,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { PAYABLE_SELECT } from "@/server/stock-store";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.
// Klinik kecil: semua faktur dimuat sekali lalu disaring di memori.

export type PayableRow = {
  id: string;
  supplierId: string;
  supplierName: string;
  branchName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  paid: number;
  returned: number;
  refunded: number;
  balance: number;
  status: PayableStatus;
  overdue: boolean;
};

async function loadPayables(): Promise<PayableRow[]> {
  const today = witaDateString(new Date());
  const invoices = await prisma.purchaseInvoice.findMany({
    select: {
      id: true,
      supplierId: true,
      invoiceNumber: true,
      invoiceDate: true,
      supplier: { select: { name: true } },
      branch: { select: { name: true } },
      ...PAYABLE_SELECT,
    },
  });
  return invoices.map((invoice) => {
    const summary = payableSummary(invoice, today);
    return {
      id: invoice.id,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplier.name,
      branchName: invoice.branch.name,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: dateOnlyString(invoice.invoiceDate),
      dueDate: dateOnlyString(invoice.dueDate),
      total: invoice.total,
      paid: summary.paid,
      returned: summary.returned,
      refunded: summary.refunded,
      balance: summary.balance,
      status: summary.status,
      overdue: summary.overdue,
    };
  });
}

/** Daftar hutang (spec stok 6.1). Lunas/Dibatalkan: terbaru di atas; lainnya: terlambat lalu jatuh tempo terdekat. */
export async function listPayables(filter: { view: PayableView; supplierId?: string }): Promise<PayableRow[]> {
  await requireCapability("payable:manage");
  const today = witaDateString(new Date());
  const rows = (await loadPayables()).filter(
    (row) => matchesPayableView(row, filter.view, today) && (!filter.supplierId || row.supplierId === filter.supplierId),
  );
  if (filter.view === "LUNAS" || filter.view === "DIBATALKAN") {
    return rows.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));
  }
  return rows.sort(comparePayables);
}

export type PayablesOverview = {
  /** Σ sisa hutang yang belum lunas (kredit tidak mengurangi). */
  totalBalance: number;
  overdueBalance: number;
  overdueCount: number;
  dueSoonCount: number;
  /** Σ kredit dari supplier yang belum dikembalikan. */
  credit: number;
  bySupplier: { supplierId: string; supplierName: string; balance: number; overdueCount: number }[];
};

/** Ringkasan di atas daftar hutang dan kotak Hutang di dasbor (spec stok 6.1, 6.5). */
export async function payablesOverview(): Promise<PayablesOverview> {
  await requireCapability("payable:manage");
  const today = witaDateString(new Date());
  const rows = (await loadPayables()).filter((row) => row.status !== "DIBATALKAN");
  const bySupplier = new Map<string, { supplierId: string; supplierName: string; balance: number; overdueCount: number }>();
  const overview: PayablesOverview = { totalBalance: 0, overdueBalance: 0, overdueCount: 0, dueSoonCount: 0, credit: 0, bySupplier: [] };
  for (const row of rows) {
    if (row.balance < 0) {
      overview.credit += -row.balance;
      continue;
    }
    if (row.balance === 0) continue;
    overview.totalBalance += row.balance;
    if (row.overdue) {
      overview.overdueBalance += row.balance;
      overview.overdueCount += 1;
    } else if (matchesPayableView(row, "JATUH_TEMPO", today)) {
      overview.dueSoonCount += 1;
    }
    const entry = bySupplier.get(row.supplierId) ?? { supplierId: row.supplierId, supplierName: row.supplierName, balance: 0, overdueCount: 0 };
    entry.balance += row.balance;
    if (row.overdue) entry.overdueCount += 1;
    bySupplier.set(row.supplierId, entry);
  }
  overview.bySupplier = [...bySupplier.values()].sort((a, b) => b.balance - a.balance);
  return overview;
}

/** Angka di menu samping Hutang: faktur terlambat. */
export async function countOverduePayables(): Promise<number> {
  await requireCapability("payable:manage");
  return (await loadPayables()).filter((row) => row.overdue).length;
}
