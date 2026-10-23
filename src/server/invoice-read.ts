import type { Prisma } from "@prisma/client";
import { marginOf } from "@/lib/costing";
import { counterState } from "@/lib/counter-stock";
import { prisma } from "@/lib/db";
import type { DispensingStatusValue } from "@/lib/dispensing";
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
import { dateOnlyString, type PaymentMethodValue } from "@/lib/stock";
import { witaDateString } from "@/lib/time";
import { TOTALS_SELECT } from "@/server/invoice-store";
import type { InvoiceA4 } from "@/lib/invoice-a4";
import { loadInvoiceA4 } from "@/server/invoice-a4-store";
import { packageLineNotes } from "@/server/package-store";
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
    where: {
      // Status disaring di basis data sebelum batas 300, agar tagihan lama tidak hilang dari tampilannya.
      status: filter.view === "DRAF" ? "DRAF" : filter.view === "DIBATALKAN" ? "DIBATALKAN" : "FINAL",
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { patient: { name: { contains: q, mode: "insensitive" } } },
              { patient: { medicalRecordNumber: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
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

/** Kunjungan final dalam 30 hari terakhir tanpa tagihan aktif; Konsultasi Online tanpa treatment dan tanpa penyerahan tidak ikut. */
function billableWhere(now: Date): Prisma.EncounterWhereInput {
  return {
    status: "FINAL",
    finalizedAt: { gte: new Date(now.getTime() - BILLABLE_DAYS * 24 * 3600_000) },
    appointment: { patientId: { not: null }, invoices: { none: { status: { not: "DIBATALKAN" } } } },
    // Konsultasi Online tanpa treatment hanya ikut bila dokter menitipkan obat lewat penyerahan (spec penyerahan 7).
    OR: [{ appointment: { channel: "KLINIK" } }, { treatments: { some: {} } }, { appointment: { dispensing: { isNot: null } } }],
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
  /** quantity × unitPrice. */
  gross: number;
  /** Jumlah baris setelah diskon baris. */
  amount: number;
  discountAmount: number;
  discountReason: string | null;
  discountSource: "PROMO" | "MANUAL" | null;
  /** Penyetuju diskon manual baris (spec PIN P11). */
  discountApprovedByName: string | null;
  priceNote: string | null;
  /** Penyetuju harga di luar katalog (spec PIN P11). */
  priceApprovedByName: string | null;
  serviceId: string | null;
  itemId: string | null;
  /** Berasal dari katalog (layanan atau barang): harga yang diubah wajib catatan. */
  catalogLinked: boolean;
  /** Berasal dari penyerahan Apoteker: jumlah terkunci dan tidak bisa dihapus resepsionis. */
  fromDispensing: boolean;
  /** Baris paket yang disarankan dokter; dihapus hanya lewat Tidak dibeli (spec vital perawat PR3). */
  fromDoctorPackage: boolean;
  /** Baris dari resep dokter (spec resep dokter 4): bisa dikurangi resepsionis dengan alasan. */
  prescription: { prescribedQuantity: number; usage: string } | null;
  /** Pelaksana treatment; nama saja yang tampil bagi resepsionis (spec harga modal M8). */
  performerId: string | null;
  performerName: string | null;
  /** Baris PAKET: paket katalog yang dijual (spec paket 5). */
  treatmentPackageId: string | null;
  /**
   * Baris TREATMENT atau BARANG yang memakai paket (spec paket 6; paket barang PB3–PB4): paket customer
   * (patientPackageItemId) atau paket yang dibeli di tagihan ini (purchaseLineId, baris PAKET-nya).
   */
  packageUse: { patientPackageItemId: string | null; purchaseLineId: string | null; packageName: string } | null;
  /** Keterangan paket di bawah nama baris (isi dan masa berlaku, atau sesi paket yang dipakai). */
  packageNote: string | null;
  /**
   * Modal dan margin baris (spec harga modal 7), null bagi peran tanpa price:manage. `stockCost` hanya untuk barang,
   * null bila ada harga beli yang belum diisi; `cost` = harga pokok barang + bahan + alat + komisi.
   */
  costing: { stockCost: number | null; materialCost: number; toolCost: number; otherCost: number; commission: number; cost: number; margin: number } | null;
};

export type InvoicePaymentRow = {
  id: string;
  amount: number;
  method: PaymentMethodValue;
  paidAt: string;
  reference: string | null;
  /** Transfer bank: salinan rekening tujuan klinik dan data pengirim (spec perbaikan tagihan 8). */
  destinationLabel: string | null;
  senderBank: string | null;
  senderAccountName: string | null;
  senderAccountNumber: string | null;
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
  /** Status penyerahan obat kunjungan ini; null bila tidak ada. Tidak pernah memuat isi catatan. */
  dispensing: DispensingStatusValue | null;
  /** Asal penyerahan: DOKTER = resep dokter, tanpa langkah penyerahan Apoteker (spec resep dokter 4). */
  dispensingSource: "APOTEKER" | "DOKTER" | null;
  /** Obat resep dokter yang dijadikan 0 oleh resepsionis; bisa dikembalikan selama tagihan draf. */
  droppedPrescriptions: { dispensingLineId: string; name: string; prescribedQuantity: number; reason: string }[];
  /** Paket dari dokter yang tidak dibeli; bisa dikembalikan selama draf (spec vital perawat PR3). */
  declinedPackages: { encounterPackageId: string; name: string; reason: string }[];
  visitDate: Date | null;
  discountKind: DiscountKindValue | null;
  discountValue: number;
  discountReason: string | null;
  discountByName: string | null;
  /** Penyetuju diskon tagihan (spec PIN P11). */
  discountApprovedByName: string | null;
  totals: InvoiceTotals;
  notes: string | null;
  createdByName: string;
  createdAt: Date;
  finalizedAt: Date | null;
  finalizedByName: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
  cancelReason: string | null;
  /** Penyetuju pembatalan tagihan final (spec PIN P11). */
  cancelApprovedByName: string | null;
  lines: InvoiceLineRow[];
  /** Ada baris dari resep dokter: tombol Cetak etiket tampil (spec resep dokter 5). */
  hasPrescription: boolean;
  payments: InvoicePaymentRow[];
  /** Pernah ada pembayaran (termasuk yang dibatalkan): pembatalan tagihan butuh invoice:correct. */
  everPaid: boolean;
  /** Ringkasan margin tagihan (spec harga modal 7); null bagi peran tanpa price:manage. `revenue` = total tagihan. */
  margin: { revenue: number; stockCost: number; materialCost: number; toolCost: number; otherCost: number; commission: number; margin: number; missingStockCost: boolean } | null;
};

/** Ringkasan margin dari `costing` setiap baris (spec harga modal 7). */
function marginSummary(lines: readonly InvoiceLineRow[], revenue: number, missingStockCost: boolean): NonNullable<InvoiceDetail["margin"]> {
  const sum = (pick: (c: NonNullable<InvoiceLineRow["costing"]>) => number) => lines.reduce((total, line) => total + (line.costing ? pick(line.costing) : 0), 0);
  const stockCost = sum((c) => c.stockCost ?? 0);
  const materialCost = sum((c) => c.materialCost);
  const toolCost = sum((c) => c.toolCost);
  const otherCost = sum((c) => c.otherCost);
  const commission = sum((c) => c.commission);
  return { revenue, stockCost, materialCost, toolCost, otherCost, commission, margin: marginOf({ revenue, stockCost, materialCost, toolCost, otherCost, commission }), missingStockCost };
}

export async function getInvoiceDetail(id: string): Promise<InvoiceDetail | null> {
  const actor = await requireCapability("invoice:read");
  const withCost = can(actor.role, "price:manage");
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
      discountApprovedByName: true,
      notes: true,
      createdByName: true,
      createdAt: true,
      finalizedAt: true,
      finalizedByName: true,
      cancelledAt: true,
      cancelledByName: true,
      cancelReason: true,
      cancelApprovedByName: true,
      branchId: true,
      appointmentId: true,
      patient: { select: { id: true, name: true, medicalRecordNumber: true } },
      branch: { select: { name: true } },
      appointment: {
        select: {
          startAt: true,
          // Paket dari dokter yang tidak dibeli, dengan alasannya (spec vital perawat PR3).
          encounter: {
            select: {
              packages: {
                where: { decline: { isNot: null } },
                orderBy: { sortOrder: "asc" },
                select: { id: true, packageName: true, decline: { select: { reason: true } } },
              },
            },
          },
          dispensing: {
            select: {
              status: true,
              source: true,
              lines: {
                where: { billedQuantity: 0, invoiceLine: null },
                orderBy: { sortOrder: "asc" },
                select: { id: true, itemName: true, quantity: true, billingNote: true },
              },
            },
          },
        },
      },
      lines: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          kind: true,
          name: true,
          quantity: true,
          unitPrice: true,
          priceNote: true,
          priceApprovedByName: true,
          serviceId: true,
          itemId: true,
          dispensingLineId: true,
          dispensingLine: { select: { quantity: true, usage: true, dispensing: { select: { source: true } } } },
          encounterPackageId: true,
          discountAmount: true,
          discountReason: true,
          discountSource: true,
          discountApprovedByName: true,
          materialCost: true,
          toolCost: true,
          otherCost: true,
          commissionAmount: true,
          treatmentPackageId: true,
          patientPackageItemId: true,
          packageSourceLineId: true,
          packageSourceLine: { select: { name: true } },
          performerId: true,
          performerName: true,
          patientPackageItem: { select: { patientPackage: { select: { name: true } } } },
          stockUses: { select: { quantity: true, unitCost: true } },
        },
      },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!invoice) return null;
  const notes = await packageLineNotes(prisma, invoice.lines, { draft: invoice.status === "DRAF" });

  const totals = invoiceTotals({
    status: invoice.status,
    discountKind: invoice.discountKind,
    discountValue: invoice.discountValue,
    lines: invoice.lines,
    payments: invoice.payments,
  });
  const costingOf = (line: (typeof invoice.lines)[number]) => {
    if (!withCost) return null;
    const stockCost =
      line.kind === "BARANG" ? (line.stockUses.some((use) => use.unitCost === null) ? null : line.stockUses.reduce((sum, use) => sum + use.quantity * use.unitCost!, 0)) : null;
    const amount = line.quantity * line.unitPrice - line.discountAmount;
    const cost = (stockCost ?? 0) + line.materialCost + line.toolCost + line.otherCost + line.commissionAmount;
    return { stockCost, materialCost: line.materialCost, toolCost: line.toolCost, otherCost: line.otherCost, commission: line.commissionAmount, cost, margin: amount - cost };
  };

  const lines = invoice.lines.map((line) => ({
    id: line.id,
    kind: line.kind,
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    gross: line.quantity * line.unitPrice,
    amount: line.quantity * line.unitPrice - line.discountAmount,
    discountAmount: line.discountAmount,
    discountReason: line.discountReason,
    discountSource: line.discountSource,
    discountApprovedByName: line.discountApprovedByName,
    priceNote: line.priceNote,
    priceApprovedByName: line.priceApprovedByName,
    serviceId: line.serviceId,
    itemId: line.itemId,
    catalogLinked: line.serviceId !== null || line.itemId !== null || line.treatmentPackageId !== null,
    treatmentPackageId: line.treatmentPackageId,
    packageUse:
      line.patientPackageItemId || line.packageSourceLineId
        ? {
            patientPackageItemId: line.patientPackageItemId,
            purchaseLineId: line.packageSourceLineId,
            packageName: line.patientPackageItem?.patientPackage.name ?? line.packageSourceLine?.name ?? "",
          }
        : null,
    packageNote: notes.get(line.id) ?? null,
    fromDispensing: line.dispensingLineId !== null,
    fromDoctorPackage: line.encounterPackageId !== null,
    prescription:
      line.dispensingLine?.dispensing.source === "DOKTER" ? { prescribedQuantity: line.dispensingLine.quantity, usage: line.dispensingLine.usage } : null,
    performerId: line.performerId,
    performerName: line.performerName,
    costing: costingOf(line),
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
    dispensing: invoice.appointment?.dispensing?.status ?? null,
    dispensingSource: invoice.appointment?.dispensing?.source ?? null,
    droppedPrescriptions:
      invoice.status === "DRAF" && invoice.appointment?.dispensing?.source === "DOKTER"
        ? invoice.appointment.dispensing.lines.map((line) => ({
            dispensingLineId: line.id,
            name: line.itemName,
            prescribedQuantity: line.quantity,
            reason: line.billingNote ?? "",
          }))
        : [],
    declinedPackages:
      invoice.status === "DRAF"
        ? (invoice.appointment?.encounter?.packages ?? []).map((row) => ({ encounterPackageId: row.id, name: row.packageName, reason: row.decline?.reason ?? "" }))
        : [],
    visitDate: invoice.appointment?.startAt ?? null,
    discountKind: invoice.discountKind,
    discountValue: invoice.discountValue,
    discountReason: invoice.discountReason,
    discountByName: invoice.discountByName,
    discountApprovedByName: invoice.discountApprovedByName,
    totals,
    notes: invoice.notes,
    createdByName: invoice.createdByName,
    createdAt: invoice.createdAt,
    finalizedAt: invoice.finalizedAt,
    finalizedByName: invoice.finalizedByName,
    cancelledAt: invoice.cancelledAt,
    cancelledByName: invoice.cancelledByName,
    cancelReason: invoice.cancelReason,
    cancelApprovedByName: invoice.cancelApprovedByName,
    lines,
    hasPrescription: lines.some((line) => line.prescription !== null),
    payments: invoice.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      method: payment.method,
      paidAt: dateOnlyString(payment.paidAt),
      reference: payment.reference,
      destinationLabel: payment.destinationLabel,
      senderBank: payment.senderBank,
      senderAccountName: payment.senderAccountName,
      senderAccountNumber: payment.senderAccountNumber,
      staffName: payment.staffName,
      createdAt: payment.createdAt,
      revokedAt: payment.revokedAt,
      revokedByName: payment.revokedByName,
      revokeReason: payment.revokeReason,
    })),
    everPaid: invoice.payments.length > 0,
    margin: withCost ? marginSummary(lines, totals.total, invoice.lines.some((line) => line.kind === "BARANG" && line.stockUses.some((use) => use.unitCost === null))) : null,
  };
}

/** Pilihan pelaksana di editor draf (spec harga modal 6): dokter dan terapis aktif. */
export async function listPerformers(): Promise<{ id: string; name: string }[]> {
  await requireCapability("invoice:read");
  return prisma.staff.findMany({ where: { isActive: true, role: { in: ["DOKTER", "TERAPIS"] } }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
}

export type BillingItem = { id: string; code: string; name: string; unit: string; sellPrice: number; available: number };

/** Katalog barang untuk tagihan (spec tagihan 6): harga jual dan stok meja tersedia di cabang (spec stok meja SM1), tanpa harga beli dan tanpa batch. */
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
        where: { branchId: String(branchId ?? ""), counterRemaining: { gt: 0 } },
        select: { counterRemaining: true, expiryDate: true },
      },
    },
  });
  return items.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    unit: item.unit,
    sellPrice: item.sellPrice ?? 0,
    available: counterState(item.batches, 0, today).available,
  }));
}

/** Tagihan final yang belum lunas (spec tagihan 8): jumlah dan total sisanya. */
export async function unpaidOverview(): Promise<{ count: number; balance: number }> {
  await requireCapability("invoice:read");
  const rows = await prisma.invoice.findMany({ where: { status: "FINAL" }, select: TOTALS_SELECT });
  let count = 0;
  let balance = 0;
  for (const row of rows) {
    const { balance: left } = invoiceTotals(row);
    if (left > 0) {
      count += 1;
      balance += left;
    }
  }
  return { count, balance };
}
export type PrescriptionLabelData = { patientName: string; startAt: Date; doctorName: string; lines: { name: string; quantity: number; usage: string }[] };

/** Etiket obat dari tagihan (spec resep dokter 5): hanya baris dari resep dokter; tanpa harga dan tanpa data klinis. */
export async function getInvoicePrescriptionLabel(invoiceId: string): Promise<PrescriptionLabelData | null> {
  await requireCapability("invoice:read");
  const invoice = await prisma.invoice.findUnique({
    where: { id: String(invoiceId ?? "") },
    select: {
      patient: { select: { name: true } },
      appointment: { select: { startAt: true, staff: { select: { name: true } }, encounter: { select: { finalizedByName: true } } } },
      lines: {
        where: { dispensingLine: { dispensing: { source: "DOKTER" } } },
        orderBy: { sortOrder: "asc" },
        select: { name: true, quantity: true, dispensingLine: { select: { usage: true } } },
      },
    },
  });
  if (!invoice || !invoice.appointment || invoice.lines.length === 0) return null;
  return {
    patientName: invoice.patient.name,
    startAt: invoice.appointment.startAt,
    // Dokter yang menulis resep (memfinalkan catatan), bukan staf booking: booking treatment bisa atas nama terapis.
    doctorName: invoice.appointment.encounter?.finalizedByName ?? invoice.appointment.staff.name,
    lines: invoice.lines.map((l) => ({ name: l.name, quantity: l.quantity, usage: l.dispensingLine?.usage ?? "" })),
  };
}

/** Invoice A4 untuk dicetak staf (spec invoice A4 IA8): final atau dibatalkan (cap DIBATALKAN, IA9); null untuk draf. */
export async function getInvoiceA4(id: string): Promise<InvoiceA4 | null> {
  await requireCapability("invoice:read");
  return loadInvoiceA4(id);
}
