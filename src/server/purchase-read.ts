import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import {
  dateOnlyString,
  payableSummary,
  type PayableStatus,
  type PayableSummary,
  type PaymentMethodValue,
  type SupplierPaymentKindValue,
} from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { requireCapability } from "@/server/session";
import { PAYABLE_SELECT } from "@/server/stock-store";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type PurchaseRow = {
  id: string;
  invoiceDate: string;
  invoiceNumber: string;
  supplierName: string;
  branchName: string;
  total: number;
  lineCount: number;
  status: PayableStatus;
  overdue: boolean;
};

/** Tab "Barang masuk": faktur terbaru di atas, paling banyak 200. */
export async function listPurchases(): Promise<PurchaseRow[]> {
  await requireCapability("stock:read");
  const today = witaDateString(new Date());
  const invoices = await prisma.purchaseInvoice.findMany({
    orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      invoiceDate: true,
      invoiceNumber: true,
      supplier: { select: { name: true } },
      branch: { select: { name: true } },
      _count: { select: { lines: true } },
      ...PAYABLE_SELECT,
    },
  });
  return invoices.map((invoice) => {
    const summary = payableSummary(invoice, today);
    return {
      id: invoice.id,
      invoiceDate: dateOnlyString(invoice.invoiceDate),
      invoiceNumber: invoice.invoiceNumber,
      supplierName: invoice.supplier.name,
      branchName: invoice.branch.name,
      total: invoice.total,
      lineCount: invoice._count.lines,
      status: summary.status,
      overdue: summary.overdue,
    };
  });
}

export type PurchaseLineRow = {
  id: string;
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  amount: number;
  batchNumber: string | null;
  expiryDate: string | null;
  batchId: string;
  batchRemaining: number;
};

export type SupplierReturnRow = {
  id: string;
  createdAt: Date;
  staffName: string;
  note: string | null;
  total: number;
  lines: { itemName: string; batchNumber: string | null; quantity: number; amount: number }[];
};

export type SupplierPaymentRow = {
  id: string;
  kind: SupplierPaymentKindValue;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string | null;
  staffName: string;
  createdAt: Date;
  revokedAt: Date | null;
  revokedByName: string | null;
  revokeReason: string | null;
};

export type PurchaseDetail = {
  id: string;
  supplierName: string;
  branchName: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  total: number;
  notes: string | null;
  createdByName: string;
  createdAt: Date;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  lines: PurchaseLineRow[];
  returns: SupplierReturnRow[];
  summary: PayableSummary;
  /** Hanya untuk payable:manage (spec stok 6.2); null bagi Apoteker. */
  payments: SupplierPaymentRow[] | null;
  /** Syarat batal faktur (spec stok 6.4) terpenuhi. */
  canCancel: boolean;
};

export async function getPurchaseDetail(id: string): Promise<PurchaseDetail | null> {
  const actor = await requireCapability("stock:read");
  const withPayments = can(actor.role, "payable:manage");
  const today = witaDateString(new Date());
  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: String(id ?? "") },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      notes: true,
      createdByName: true,
      createdAt: true,
      cancelledByName: true,
      cancelReason: true,
      supplier: { select: { name: true } },
      branch: { select: { name: true } },
      ...PAYABLE_SELECT,
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          quantity: true,
          unitCost: true,
          batchNumber: true,
          expiryDate: true,
          item: { select: { id: true, code: true, name: true, unit: true } },
          batch: { select: { id: true, quantityReceived: true, quantityRemaining: true, _count: { select: { movements: true } } } },
        },
      },
    },
  });
  if (!invoice) return null;

  const [returns, payments] = await Promise.all([
    prisma.supplierReturn.findMany({
      where: { invoiceId: invoice.id },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        staffName: true,
        note: true,
        total: true,
        lines: { select: { quantity: true, amount: true, batch: { select: { batchNumber: true, item: { select: { name: true } } } } } },
      },
    }),
    withPayments
      ? prisma.supplierPayment.findMany({ where: { invoiceId: invoice.id }, orderBy: { createdAt: "asc" } })
      : Promise.resolve(null),
  ]);

  const summary = payableSummary(invoice, today);
  const batches = invoice.lines.flatMap((line) => (line.batch ? [line.batch] : []));
  const canCancel =
    invoice.cancelledAt === null &&
    invoice.payments.every((payment) => payment.revokedAt !== null) &&
    invoice.returns.length === 0 &&
    batches.length === invoice.lines.length &&
    batches.every((batch) => batch.quantityRemaining === batch.quantityReceived && batch._count.movements === 1);

  return {
    id: invoice.id,
    supplierName: invoice.supplier.name,
    branchName: invoice.branch.name,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: dateOnlyString(invoice.invoiceDate),
    dueDate: dateOnlyString(invoice.dueDate),
    total: invoice.total,
    notes: invoice.notes,
    createdByName: invoice.createdByName,
    createdAt: invoice.createdAt,
    cancelledAt: invoice.cancelledAt,
    cancelledByName: invoice.cancelledByName,
    cancelReason: invoice.cancelReason,
    lines: invoice.lines.map((line) => ({
      id: line.id,
      itemId: line.item.id,
      itemCode: line.item.code,
      itemName: line.item.name,
      unit: line.item.unit,
      quantity: line.quantity,
      unitCost: line.unitCost,
      amount: line.quantity * line.unitCost,
      batchNumber: line.batchNumber,
      expiryDate: line.expiryDate ? dateOnlyString(line.expiryDate) : null,
      batchId: line.batch?.id ?? "",
      batchRemaining: line.batch?.quantityRemaining ?? 0,
    })),
    returns: returns.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      staffName: r.staffName,
      note: r.note,
      total: r.total,
      lines: r.lines.map((line) => ({
        itemName: line.batch.item.name,
        batchNumber: line.batch.batchNumber,
        quantity: line.quantity,
        amount: line.amount,
      })),
    })),
    summary,
    payments: payments
      ? payments.map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          amount: payment.amount,
          method: payment.method,
          paidAt: dateOnlyString(payment.paidAt),
          reference: payment.reference,
          staffName: payment.staffName,
          createdAt: payment.createdAt,
          revokedAt: payment.revokedAt,
          revokedByName: payment.revokedByName,
          revokeReason: payment.revokeReason,
        }))
      : null,
    canCancel,
  };
}
