import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  BILLABLE_DAYS,
  invoiceTotals,
  matchesInvoiceView,
  type DiscountKindValue,
  type InvoiceDisplayStatus,
  type InvoiceLineKindValue,
  type InvoiceStatusValue,
  type InvoiceTotals,
  type InvoiceView,
} from "@/lib/invoice";
import { can } from "@/lib/permissions";
import { dateOnlyString, stockFlags, type PaymentMethodValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { TOTALS_SELECT } from "@/server/invoice-store";
import { requireCapability } from "@/server/session";

// Tanpa "use server": dibaca halaman server panel admin, tidak dipanggil browser.

export type InvoiceRow = {
  id: string;
  number: string | null;
  createdAt: Date;
  patientId: string;
  patientName: string;
  branchName: string;
  display: InvoiceDisplayStatus;
  total: number;
  balance: number;
  lineCount: number;
};

/** Daftar tagihan (spec tagihan 4.1): terbaru di atas, paling banyak 300 yang cocok dengan pencarian. */
export async function listInvoices(filter: { view: Exclude<InvoiceView, "PERLU_DITAGIH">; q?: string }): Promise<InvoiceRow[]> {
  await requireCapability("invoice:read");
  const q = filter.q?.trim();
  const invoices = await prisma.invoice.findMany({
    where: q
      ? {
          OR: [
            { number: { contains: q, mode: "insensitive" } },
            { patient: { name: { contains: q, mode: "insensitive" } } },
            { patient: { medicalRecordNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      number: true,
      createdAt: true,
      patient: { select: { id: true, name: true } },
      branch: { select: { name: true } },
      ...TOTALS_SELECT,
    },
  });
  return invoices
    .map((invoice) => {
      const totals = invoiceTotals(invoice);
      return {
        id: invoice.id,
        number: invoice.number,
        createdAt: invoice.createdAt,
        patientId: invoice.patient.id,
        patientName: invoice.patient.name,
        branchName: invoice.branch.name,
        display: totals.display,
        total: totals.total,
        balance: totals.balance,
        lineCount: invoice.lines.length,
      };
    })
    .filter((row) => matchesInvoiceView(row, filter.view));
}

/** Kunjungan final dalam 30 hari terakhir tanpa tagihan aktif; Konsultasi Online tanpa treatment tidak ikut. */
function billableWhere(now: Date): Prisma.EncounterWhereInput {
  return {
    status: "FINAL",
    finalizedAt: { gte: new Date(now.getTime() - BILLABLE_DAYS * 24 * 3600_000) },
    appointment: { patientId: { not: null }, invoices: { none: { status: { not: "DIBATALKAN" } } } },
    OR: [{ appointment: { channel: "KLINIK" } }, { treatments: { some: {} } }],
  };
}

export type BillableVisit = {
  appointmentId: string;
  patientId: string;
  patientName: string;
  medicalRecordNumber: string;
  branchName: string;
  serviceName: string | null;
  finalizedAt: Date;
  treatmentCount: number;
  online: boolean;
};

export async function listBillableVisits(): Promise<BillableVisit[]> {
  await requireCapability("invoice:read");
  const encounters = await prisma.encounter.findMany({
    where: billableWhere(new Date()),
    orderBy: { finalizedAt: "desc" },
    take: 200,
    select: {
      finalizedAt: true,
      _count: { select: { treatments: true } },
      appointment: {
        select: {
          id: true,
          channel: true,
          patient: { select: { id: true, name: true, medicalRecordNumber: true } },
          branch: { select: { name: true } },
          service: { select: { name: true } },
        },
      },
    },
  });
  return encounters.flatMap((encounter) => {
    const { appointment } = encounter;
    if (!appointment.patient || !encounter.finalizedAt) return [];
    return [
      {
        appointmentId: appointment.id,
        patientId: appointment.patient.id,
        patientName: appointment.patient.name,
        medicalRecordNumber: appointment.patient.medicalRecordNumber,
        branchName: appointment.branch.name,
        serviceName: appointment.service?.name ?? null,
        finalizedAt: encounter.finalizedAt,
        treatmentCount: encounter._count.treatments,
        online: appointment.channel === "ONLINE",
      },
    ];
  });
}

/** Angka di menu Tagihan dan kotak Perlu ditagih di dasbor. */
export async function countBillable(): Promise<number> {
  await requireCapability("invoice:read");
  return prisma.encounter.count({ where: billableWhere(new Date()) });
}

export type InvoiceLineRow = {
  id: string;
  kind: InvoiceLineKindValue;
  name: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  priceNote: string | null;
  serviceId: string | null;
  itemId: string | null;
  /** Berasal dari katalog (layanan atau barang): harga yang diubah wajib catatan. */
  catalogLinked: boolean;
  /** Harga pokok baris barang; null bila pengguna tidak memegang stock:read atau bukan barang. */
  cost: number | null;
};

export type InvoicePaymentRow = {
  id: string;
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

export type InvoiceDetail = {
  id: string;
  number: string | null;
  status: InvoiceStatusValue;
  version: number;
  patient: { id: string; name: string; medicalRecordNumber: string };
  branchId: string;
  branchName: string;
  appointmentId: string | null;
  visitDate: Date | null;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  discountReason: string | null;
  discountByName: string | null;
  totals: InvoiceTotals;
  notes: string | null;
  createdByName: string;
  createdAt: Date;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  lines: InvoiceLineRow[];
  payments: InvoicePaymentRow[];
  /** Pernah ada pembayaran (termasuk yang dibatalkan): pembatalan tagihan butuh invoice:correct. */
  everPaid: boolean;
  /** Σ harga pokok baris barang; null bila pengguna tidak memegang stock:read. */
  cost: number | null;
};

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const actor = await requireCapability("invoice:read");
  const withCost = can(actor.role, "stock:read");
  const invoice = await prisma.invoice.findUnique({
    where: { id: String(id ?? "") },
    select: {
      id: true,
      number: true,
      status: true,
      version: true,
      discountKind: true,
      discountValue: true,
      discountReason: true,
      discountByName: true,
      notes: true,
      createdByName: true,
      createdAt: true,
      finalizedAt: true,
      finalizedByName: true,
      cancelledAt: true,
      cancelledByName: true,
      cancelReason: true,
      branchId: true,
      appointmentId: true,
      patient: { select: { id: true, name: true, medicalRecordNumber: true } },
      branch: { select: { name: true } },
      appointment: { select: { startAt: true } },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          kind: true,
          name: true,
          quantity: true,
          unitPrice: true,
          priceNote: true,
          serviceId: true,
          itemId: true,
          stockUses: { select: { quantity: true, unitCost: true } },
        },
      },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) return null;

  const lines = invoice.lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    amount: line.quantity * line.unitPrice,
    priceNote: line.priceNote,
    serviceId: line.serviceId,
    itemId: line.itemId,
    catalogLinked: line.serviceId !== null || line.itemId !== null,
    cost: withCost && line.kind === "BARANG" ? line.stockUses.reduce((sum, use) => sum + use.quantity * use.unitCost, 0) : null,
  }));
  return {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    version: invoice.version,
    patient: invoice.patient,
    branchId: invoice.branchId,
    branchName: invoice.branch.name,
    appointmentId: invoice.appointmentId,
    visitDate: invoice.appointment?.startAt ?? null,
    discountKind: invoice.discountKind,
    discountValue: invoice.discountValue,
    discountReason: invoice.discountReason,
    discountByName: invoice.discountByName,
    totals: invoiceTotals({
      status: invoice.status,
      discountKind: invoice.discountKind,
      discountValue: invoice.discountValue,
      lines: invoice.lines,
      payments: invoice.payments,
    }),
    notes: invoice.notes,
    createdByName: invoice.createdByName,
    createdAt: invoice.createdAt,
    finalizedAt: invoice.finalizedAt,
    finalizedByName: invoice.finalizedByName,
    cancelledAt: invoice.cancelledAt,
    cancelledByName: invoice.cancelledByName,
    cancelReason: invoice.cancelReason,
    lines,
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paidAt: dateOnlyString(payment.paidAt),
      reference: payment.reference,
      staffName: payment.staffName,
      createdAt: payment.createdAt,
      revokedAt: payment.revokedAt,
      revokedByName: payment.revokedByName,
      revokeReason: payment.revokeReason,
    })),
    everPaid: invoice.payments.length > 0,
    cost: withCost ? lines.reduce((sum, line) => sum + (line.cost ?? 0), 0) : null,
  };
}

export type BillingItem = { id: string; code: string; name: string; unit: string; sellPrice: number; available: number };

/** Katalog barang untuk tagihan (spec tagihan 6): harga jual dan stok tersedia di cabang, tanpa harga beli dan tanpa batch. */
export async function listBillingItems(branchId: string): Promise<BillingItem[]> {
  await requireCapability("invoice:manage");
  const today = witaDateString(new Date());
  const items = await prisma.stockItem.findMany({
    where: { isActive: true, sellPrice: { not: null } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      unit: true,
      sellPrice: true,
      batches: {
        where: { branchId: String(branchId ?? ""), quantityRemaining: { gt: 0 } },
        select: { quantityRemaining: true, expiryDate: true, unitCost: true },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    sellPrice: item.sellPrice ?? 0,
    available: stockFlags(item.batches, 0, today).available,
  }));
}
