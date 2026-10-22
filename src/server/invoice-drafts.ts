"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { CONSULTATION_SERVICE_SLUG } from "@/lib/booking-rules";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import {
  invoiceGrossSubtotal,
  invoiceSubtotal,
  manualItemDiscount,
  validateDiscount,
  validateLineDiscount,
  validateFreeLine,
  validateServiceLineAdd,
  validateItemAdd,
  validateLineEdit,
  visitLines,
  type FreeLineInput,
  type DiscountKindValue,
} from "@/lib/invoice";
import { formatRupiah } from "@/lib/format";
import { visitContentsLabel, type VisitContent } from "@/lib/package-visit";
import { dateLabel, dateOnlyString } from "@/lib/stock";
import { can } from "@/lib/permissions";
import { validateReduction } from "@/lib/prescription";
import { safeRevalidatePath } from "@/lib/revalidate";
import { promoDiscount } from "@/lib/stock-promo";
import { witaDateString } from "@/lib/time";
import { recordAudit } from "@/server/audit";
import { isExclusionViolation } from "@/server/db-errors";
import { handedInvoiceLines, lockDispensingRow } from "@/server/dispensing-store";
import { guardDiscount, touchDraft } from "@/server/invoice-store";
import { remainingByItem } from "@/server/package-store";
import { requireCapability } from "@/server/session";

const DISPENSED_QUANTITY = "Jumlah obat dari penyerahan tidak bisa diubah. Minta Apoteker membuka kembali penyerahan.";
const PROMO_SELECT = { promoName: true, promoKind: true, promoValue: true, promoStartsOn: true, promoEndsOn: true } as const;
const OVER_LIMIT = "Diskon di atas 20% diberikan oleh Admin Keuangan.";
const NO_DISCOUNT = { discountAmount: 0, discountReason: null, discountSource: null } as const;
const PACKAGE_QUANTITY = "Jumlah paket selalu 1. Tambahkan baris paket lagi untuk paket berikutnya.";
const NOT_PACKAGE_LINE = "Hanya baris treatment atau barang dari katalog yang bisa memakai paket.";
const PACKAGE_PRICE = "Baris sesi paket selalu Rp 0. Klik Lepas paket untuk menagih harga biasa.";
const PACKAGE_DISCOUNT = "Baris sesi paket tidak bisa diberi diskon.";
const TAKE_QUANTITY = "Jumlah barang 1–9999.";
const DISPENSED_REMOVE = "Obat dari penyerahan tidak bisa dihapus. Minta Apoteker membuka kembali penyerahan.";
const PRESCRIPTION_QUANTITY = "Jumlah obat dari resep dokter diubah lewat tombol Kurangi.";
const PRESCRIPTION_REMOVE = "Obat dari resep dokter dihapus lewat tombol Kurangi (jumlah 0) dengan alasan.";

function revalidateInvoices(invoiceId?: string) {
  safeRevalidatePath("/admin/tagihan");
  safeRevalidatePath("/admin");
  if (invoiceId) safeRevalidatePath(`/admin/tagihan/${invoiceId}`);
}

/**
 * Buat tagihan dari kunjungan final (spec tagihan 4.2). Dua klik bersamaan menghasilkan satu
 * tagihan: yang kalah gagal di constraint eksklusi dan dibawa ke tagihan yang sudah ada.
 */
export async function createInvoiceFromVisit(appointmentId: string): Promise<ActionResult<{ id: string; existing: boolean }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const id = String(appointmentId ?? "");
    const appointment = await prisma.appointment.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        patientId: true,
        branchId: true,
        channel: true,
        service: { select: { id: true, name: true, promoPrice: true } },
        encounter: { select: { status: true, treatments: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceId: true, serviceName: true, performerId: true, performerName: true } } } },
      },
    });
    if (!appointment) throw new UserFacingError("Kunjungan tidak ditemukan.");
    if (appointment.encounter?.status !== "FINAL") {
      throw new UserFacingError("Hanya kunjungan yang catatannya sudah final yang bisa ditagih.");
    }
    if (!appointment.patientId) throw new UserFacingError("Kunjungan ini belum dicocokkan dengan data pasien.");

    const findActive = () =>
      prisma.invoice.findFirst({ where: { appointmentId: id, status: { not: "DIBATALKAN" } }, select: { id: true } });
    const existing = await findActive();
    if (existing) return { id: existing.id, existing: true };

    const services = await prisma.service.findMany({
      where: { id: { in: appointment.encounter.treatments.map((t) => t.serviceId) } },
      select: { id: true, promoPrice: true },
    });
    const priceOf = new Map(services.map((service) => [service.id, service.promoPrice]));
    const lines = visitLines({
      online: appointment.channel === "ONLINE",
      service: appointment.service
        ? { id: appointment.service.id, name: appointment.service.name, price: appointment.service.promoPrice }
        : null,
      treatments: appointment.encounter.treatments.map((t) => ({
        id: t.id,
        serviceId: t.serviceId,
        name: t.serviceName,
        price: priceOf.get(t.serviceId) ?? null,
      })),
    });

    // Pelaksana disalin dari catatan kunjungan (spec harga modal 6) untuk komisi.
    const performerOf = new Map(appointment.encounter.treatments.map((t) => [t.id, { performerId: t.performerId, performerName: t.performerName }]));
    const withPerformer = lines.map((line) => ({ ...line, ...(line.encounterTreatmentId ? (performerOf.get(line.encounterTreatmentId) ?? {}) : {}) }));

    try {
      const created = await prisma.$transaction(async (tx) => {
        // Baris penyerahan dikunci dulu, supaya pembuatan tagihan dan penyelesaian penyerahan bergiliran
        // (spec penyerahan 4.3): yang kedua selalu melihat hasil yang pertama.
        const dispensing = await tx.dispensing.findUnique({ where: { appointmentId: id }, select: { id: true } });
        let handed: Awaited<ReturnType<typeof handedInvoiceLines>> = [];
        if (dispensing) {
          await lockDispensingRow(tx, dispensing.id);
          handed = await handedInvoiceLines(tx, dispensing.id);
        }
        const all = [...withPerformer.map((line) => ({ ...line, dispensingLineId: null as string | null })), ...handed];
        return tx.invoice.create({
          data: {
            patientId: appointment.patientId!,
            appointmentId: id,
            branchId: appointment.branchId,
            createdById: actor.staffId,
            createdByName: actor.name,
            lines: { create: all.map((line, index) => ({ ...line, sortOrder: index })) },
          },
          select: { id: true },
        });
      });
      await recordAudit({
        actor,
        action: "invoice.create",
        entity: "Invoice",
        entityId: created.id,
        summary: `Draf dari kunjungan ${appointment.code}: ${lines.length} baris`,
      });
      revalidateInvoices(created.id);
      return { id: created.id, existing: false };
    } catch (error) {
      if (isExclusionViolation(error)) {
        const winner = await findActive();
        if (winner) return { id: winner.id, existing: true };
      }
      throw error;
    }
  });
}

/** Penjualan langsung (spec tagihan 4.1): draf tanpa kunjungan untuk pasien yang sudah ada. */
export async function createDirectSale(input: { patientId: string; branchId?: string }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const patient = await prisma.patient.findUnique({
      where: { id: String(input?.patientId ?? "") },
      select: { id: true, name: true, mergedInto: { select: { name: true, medicalRecordNumber: true } } },
    });
    if (!patient) throw new UserFacingError("Pasien tidak ditemukan.");
    if (patient.mergedInto) {
      throw new UserFacingError(
        `Pasien ini rangkap dari ${patient.mergedInto.name} (${patient.mergedInto.medicalRecordNumber}). Buat tagihan untuk pasien itu.`,
      );
    }
    const branch = input.branchId
      ? await prisma.branch.findUnique({ where: { id: String(input.branchId) }, select: { id: true, status: true } })
      : await prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true, status: true } });
    if (!branch) throw new UserFacingError("Belum ada cabang aktif.");
    if (branch.status !== "AKTIF") throw new UserFacingError("Cabang ini belum menerima transaksi.");

    const created = await prisma.invoice.create({
      data: { patientId: patient.id, branchId: branch.id, createdById: actor.staffId, createdByName: actor.name },
      select: { id: true },
    });
    await recordAudit({
      actor,
      action: "invoice.create",
      entity: "Invoice",
      entityId: created.id,
      summary: `Draf penjualan langsung untuk ${patient.name}`,
    });
    revalidateInvoices(created.id);
    return { id: created.id };
  });
}

type EditResult = ActionResult<{ version: number }>;

async function nextSortOrder(tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], invoiceId: string): Promise<number> {
  const last = await tx.invoiceLine.aggregate({ where: { invoiceId }, _max: { sortOrder: true } });
  return (last._max.sortOrder ?? -1) + 1;
}

/** Tambah barang dari katalog stok dengan harga jual saat ini (spec tagihan 4.2). */
export async function addInvoiceItem(input: { invoiceId: string; version: number; itemId: string; quantity: number }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateItemAdd(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const item = await tx.stockItem.findUnique({
        where: { id: checked.value.itemId },
        select: { id: true, name: true, isActive: true, sellPrice: true, ...PROMO_SELECT },
      });
      if (!item) throw new UserFacingError("Barang tidak ditemukan.");
      if (!item.isActive) throw new UserFacingError("Barang ini nonaktif.");
      if (item.sellPrice === null) throw new UserFacingError("Barang ini belum punya harga jual.");
      // Promo barang terpasang otomatis (spec perbaikan tagihan 5.1); tidak dihitung dalam batas 20%.
      const promo = promoDiscount(item, { quantity: checked.value.quantity, unitPrice: item.sellPrice }, witaDateString(new Date()));
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: {
            invoiceId,
            kind: "BARANG",
            name: item.name,
            quantity: checked.value.quantity,
            unitPrice: item.sellPrice!,
            itemId: item.id,
            sortOrder: await nextSortOrder(tx, invoiceId),
            ...(promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" as const } : {}),
          },
        });
      });
      return { version, summary: `Tambah barang ${item.name} ×${checked.value.quantity}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Tambah baris bebas (layanan atau treatment yang tidak ada di katalog) dengan nama dan harga sendiri. */
export async function addFreeLine(input: { invoiceId: string; version: number } & FreeLineInput): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateFreeLine(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const invoiceId = String(input.invoiceId ?? "");
    const line = checked.value;

    const version = await prisma.$transaction(async (tx) => {
      const next = await touchDraft(tx, invoiceId, input.version);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: { invoiceId, kind: line.kind, name: line.name, quantity: line.quantity, unitPrice: line.unitPrice, sortOrder: await nextSortOrder(tx, invoiceId) },
        });
      });
      return next;
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Tambah baris ${line.name} ×${line.quantity}` });
    revalidateInvoices(invoiceId);
    return { version };
  });
}

/**
 * Treatment dari katalog internal (spec layanan situs 6): baris TREATMENT tertaut `serviceId` berharga katalog, sehingga
 * pelaksana, biaya, komisi, dan sesi paket berlaku seperti baris dari kunjungan.
 */
export async function addServiceLine(input: { invoiceId: string; version: number; serviceId: string; quantity: number }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const checked = validateServiceLineAdd(input);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const { serviceId, quantity } = checked.value;
    const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true, slug: true, name: true, promoPrice: true, isActive: true } });
    if (!service?.isActive || service.slug === ONLINE_SERVICE_SLUG) throw new UserFacingError("Layanan tidak tersedia.");
    const invoiceId = String(input.invoiceId ?? "");

    const version = await prisma.$transaction(async (tx) => {
      const next = await touchDraft(tx, invoiceId, input.version);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          // Konsultasi Dokter tetap baris LAYANAN, sama dengan baris dari kunjungan (visitLines), supaya laporan per jenis konsisten.
          data: {
            invoiceId,
            kind: service.slug === CONSULTATION_SERVICE_SLUG ? "LAYANAN" : "TREATMENT",
            name: service.name,
            quantity,
            unitPrice: service.promoPrice,
            serviceId: service.id,
            sortOrder: await nextSortOrder(tx, invoiceId),
          },
        });
      });
      return next;
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Tambah baris ${service.name} ×${quantity}` });
    revalidateInvoices(invoiceId);
    return { version };
  });
}

/** Jual paket dari katalog (spec paket 5): satu baris PAKET berharga katalog, jumlah 1. */
export async function addPackageLine(input: { invoiceId: string; version: number; packageId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const pkg = await tx.treatmentPackage.findUnique({ where: { id: String(input.packageId ?? "") }, select: { id: true, name: true, price: true, isActive: true } });
      if (!pkg) throw new UserFacingError("Paket tidak ditemukan.");
      if (!pkg.isActive) throw new UserFacingError(`Paket ${pkg.name} sudah tidak dijual.`);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: { invoiceId, kind: "PAKET", name: pkg.name, quantity: 1, unitPrice: pkg.price, treatmentPackageId: pkg.id, sortOrder: await nextSortOrder(tx, invoiceId) },
        });
      });
      return { version, summary: `Tambah paket ${pkg.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Sumber jatah paket untuk satu baris: paket customer (patientPackageItemId) atau paket yang dibeli di draf ini (purchaseLineId). */
type PackageSource = { patientPackageItemId?: string | null; purchaseLineId?: string | null };
type PackageTarget = { kind: "TREATMENT" | "BARANG"; serviceId: string | null; itemId: string | null; name: string; quantity: number };
type PackageLink = { patientPackageItemId: string | null; packageSourceLineId: string | null; summary: string };

function shortMessage(target: PackageTarget, packageName: string, available: number): string {
  const left = Math.max(0, available);
  return target.kind === "BARANG"
    ? `Jatah ${target.name} di paket ${packageName} tinggal ${left}. Kurangi jumlahnya.`
    : `Sesi ${target.name} di paket ${packageName} tinggal ${left}. Lepas paket atau kurangi jumlahnya.`;
}

/**
 * Periksa sumber jatah untuk satu baris (spec paket 6; paket barang PB3–PB4) dan kembalikan kolom tautannya. Sisa dicek
 * perkiraan di sini (dikurangi draf lain, atau baris lain di draf ini untuk paket yang baru dibeli); yang mengikat adalah
 * pengecekan saat finalisasi.
 */
async function packageLink(tx: Prisma.TransactionClient, invoice: { id: string; patientId: string }, target: PackageTarget, source: PackageSource, exceptLineId: string | null): Promise<PackageLink> {
  const content = target.kind === "TREATMENT" ? { serviceId: target.serviceId } : { itemId: target.itemId };
  const others = exceptLineId ? { id: { not: exceptLineId } } : {};
  if (source.purchaseLineId) {
    const purchase = await tx.invoiceLine.findFirst({
      where: { id: String(source.purchaseLineId), invoiceId: invoice.id, kind: "PAKET" },
      select: { id: true, name: true, treatmentPackageId: true },
    });
    if (!purchase?.treatmentPackageId) throw new UserFacingError("Paket tidak ditemukan.");
    const item = await tx.treatmentPackageItem.findFirst({ where: { packageId: purchase.treatmentPackageId, ...content }, select: { sessions: true } });
    if (!item) throw new UserFacingError(`Paket ${purchase.name} tidak berisi ${target.kind === "TREATMENT" ? "treatment " : ""}${target.name}.`);
    const used = await tx.invoiceLine.aggregate({ where: { invoiceId: invoice.id, packageSourceLineId: purchase.id, kind: target.kind, ...content, ...others }, _sum: { quantity: true } });
    const available = item.sessions - (used._sum.quantity ?? 0);
    if (available < target.quantity) throw new UserFacingError(shortMessage(target, purchase.name, available));
    return { patientPackageItemId: null, packageSourceLineId: purchase.id, summary: `Pakai paket ${purchase.name} (dibeli di tagihan ini) untuk ${target.name}` };
  }

  const item = await tx.patientPackageItem.findUnique({
    where: { id: String(source.patientPackageItemId ?? "") },
    select: { id: true, serviceId: true, itemId: true, patientPackage: { select: { name: true, patientId: true, status: true, expiresOn: true } } },
  });
  if (!item) throw new UserFacingError("Paket tidak ditemukan.");
  const pkg = item.patientPackage;
  if (pkg.patientId !== invoice.patientId) throw new UserFacingError("Paket ini milik customer lain.");
  if (pkg.status !== "AKTIF") throw new UserFacingError(`Paket ${pkg.name} sudah dibatalkan.`);
  const expires = dateOnlyString(pkg.expiresOn);
  if (expires < witaDateString(new Date())) {
    throw new UserFacingError(`Paket ${pkg.name} sudah kedaluwarsa ${dateLabel(expires)}. Lepas paket atau minta Admin Keuangan memperpanjang.`);
  }
  const matches = target.kind === "TREATMENT" ? target.serviceId !== null && item.serviceId === target.serviceId : target.itemId !== null && item.itemId === target.itemId;
  if (!matches) throw new UserFacingError(`Paket ${pkg.name} tidak berisi ${target.kind === "TREATMENT" ? "treatment " : ""}${target.name}.`);
  const left = (await remainingByItem(tx, [item.id])).get(item.id) ?? 0;
  const pending = await tx.invoiceLine.aggregate({ where: { patientPackageItemId: item.id, invoice: { status: "DRAF" }, ...others }, _sum: { quantity: true } });
  const available = left - (pending._sum.quantity ?? 0);
  if (available < target.quantity) throw new UserFacingError(shortMessage(target, pkg.name, available));
  return { patientPackageItemId: item.id, packageSourceLineId: null, summary: `Pakai ${target.kind === "BARANG" ? "jatah" : "sesi"} paket ${pkg.name} untuk ${target.name}` };
}

/**
 * Tandai baris treatment atau barang sebagai pemakaian paket (spec paket 6; paket barang PB3–PB4): Rp 0 tanpa diskon.
 * Baris obat dari resep dokter boleh memakai jatah barang paket.
 */
export async function applyPackageSession(input: { invoiceId: string; version: number; lineId: string } & PackageSource): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { id: true, patientId: true } });
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: { id: true, name: true, kind: true, quantity: true, serviceId: true, itemId: true, dispensingLineId: true },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      const usable = (line.kind === "TREATMENT" && line.serviceId && !line.dispensingLineId) || (line.kind === "BARANG" && line.itemId);
      if (!usable) throw new UserFacingError(NOT_PACKAGE_LINE);
      const link = await packageLink(
        tx,
        invoice,
        { kind: line.kind as PackageTarget["kind"], serviceId: line.serviceId, itemId: line.itemId, name: line.name, quantity: line.quantity },
        input,
        line.id,
      );
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: { unitPrice: 0, priceNote: null, ...NO_DISCOUNT, patientPackageItemId: link.patientPackageItemId, packageSourceLineId: link.packageSourceLineId },
        });
      });
      return { version, summary: link.summary };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/**
 * "Ambil" jatah barang paket (spec paket barang PB4): baris BARANG Rp 0 baru, dari paket customer atau dari paket yang
 * dibeli di draf ini (dengan `itemId` barang yang diambil). Stok meja berkurang saat tagihan difinalkan.
 */
export async function takePackageItem(input: { invoiceId: string; version: number; quantity: number; itemId?: string } & PackageSource): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");
    const quantity = input?.quantity;
    if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new UserFacingError(TAKE_QUANTITY);

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { id: true, patientId: true } });
      const itemId = input.purchaseLineId
        ? String(input.itemId ?? "")
        : ((await tx.patientPackageItem.findUnique({ where: { id: String(input.patientPackageItemId ?? "") }, select: { itemId: true, serviceId: true } })) ?? { itemId: "", serviceId: null }).itemId;
      if (itemId === null) throw new UserFacingError("Hanya jatah barang yang bisa diambil. Sesi treatment dipakai di baris treatment.");
      const stock = itemId ? await tx.stockItem.findUnique({ where: { id: itemId }, select: { id: true, name: true } }) : null;
      if (!stock) throw new UserFacingError("Paket tidak ditemukan.");
      const link = await packageLink(tx, invoice, { kind: "BARANG", serviceId: null, itemId: stock.id, name: stock.name, quantity }, input, null);
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({
          data: {
            invoiceId,
            kind: "BARANG",
            name: stock.name,
            quantity,
            unitPrice: 0,
            itemId: stock.id,
            patientPackageItemId: link.patientPackageItemId,
            packageSourceLineId: link.packageSourceLineId,
            sortOrder: await nextSortOrder(tx, invoiceId),
          },
        });
      });
      return { version, summary: `Ambil ${stock.name} ×${quantity}: ${link.summary}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/**
 * "Pakai sesuai rencana" (spec jadwal paket JP3, JP8): isi kunjungan berikutnya dari satu paket customer sekaligus. Treatment
 * yang sudah ada di draf ditandai memakai paket, yang belum ada ditambahkan sebagai baris Rp 0; barang diambil sebanyak
 * jumlah per kunjungan, atau sisanya bila kurang. Isi yang sudah tertaut ke paket ini di draf tidak ditambahkan lagi.
 */
export async function applyPackageVisit(input: { invoiceId: string; version: number; patientPackageId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { id: true, patientId: true } });
      const pkg = await tx.patientPackage.findUnique({
        where: { id: String(input?.patientPackageId ?? "") },
        select: {
          name: true,
          patientId: true,
          status: true,
          items: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceId: true, itemId: true, serviceName: true, unit: true, perVisit: true } },
        },
      });
      if (!pkg || pkg.patientId !== invoice.patientId) throw new UserFacingError("Paket tidak ditemukan.");
      if (pkg.status !== "AKTIF") throw new UserFacingError(`Paket ${pkg.name} sudah dibatalkan.`);
      const itemIds = pkg.items.map((item) => item.id);
      const remaining = await remainingByItem(tx, itemIds);
      const here = await tx.invoiceLine.groupBy({ by: ["patientPackageItemId"], where: { invoiceId, patientPackageItemId: { in: itemIds } }, _sum: { quantity: true } });
      const planned = pkg.items.map((item) => {
        const want = Math.min(item.perVisit ?? 1, Math.max(0, remaining.get(item.id) ?? 0));
        const already = here.find((row) => row.patientPackageItemId === item.id)?._sum.quantity ?? 0;
        return { item, want, quantity: Math.max(0, want - already) };
      });
      if (planned.every((row) => row.want === 0)) throw new UserFacingError("Paket ini sudah habis.");
      const todo = planned.filter((row) => row.quantity > 0);
      if (todo.length === 0) throw new UserFacingError(`Isi kunjungan paket ${pkg.name} sudah ada di tagihan ini.`);

      const added: VisitContent[] = [];
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        for (const { item, quantity } of todo) {
          const source = { patientPackageItemId: item.id };
          if (item.serviceId) {
            const line = await tx.invoiceLine.findFirst({
              where: { invoiceId, kind: "TREATMENT", serviceId: item.serviceId, patientPackageItemId: null, packageSourceLineId: null, dispensingLineId: null },
              orderBy: { sortOrder: "asc" },
              select: { id: true, name: true, quantity: true },
            });
            if (line) {
              await packageLink(tx, invoice, { kind: "TREATMENT", serviceId: item.serviceId, itemId: null, name: line.name, quantity: line.quantity }, source, line.id);
              await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice: 0, priceNote: null, ...NO_DISCOUNT, patientPackageItemId: item.id, packageSourceLineId: null } });
            } else {
              await packageLink(tx, invoice, { kind: "TREATMENT", serviceId: item.serviceId, itemId: null, name: item.serviceName, quantity: 1 }, source, null);
              await tx.invoiceLine.create({
                data: { invoiceId, kind: "TREATMENT", name: item.serviceName, quantity: 1, unitPrice: 0, serviceId: item.serviceId, patientPackageItemId: item.id, sortOrder: await nextSortOrder(tx, invoiceId) },
              });
            }
            added.push({ name: item.serviceName, unit: null, quantity: 1 });
            continue;
          }
          // Barang yang sama sudah ada di draf (mis. obat resep dari penyerahan): baris itu yang memakai jatah, bukan digandakan.
          // Baris yang lebih banyak dari rencana tidak diubah diam-diam; resepsionis memutuskan lewat tombol di baris itu.
          let left = quantity;
          const existing = await tx.invoiceLine.findMany({
            where: { invoiceId, kind: "BARANG", itemId: item.itemId, patientPackageItemId: null, packageSourceLineId: null },
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, quantity: true },
          });
          for (const line of existing) {
            if (left === 0) break;
            if (line.quantity > left) {
              const planned = item.unit ? `${left} ${item.unit}` : String(left);
              throw new UserFacingError(`${line.name} ×${line.quantity} sudah ada di tagihan, lebih dari rencana ${planned}. Klik Pakai jatah paket di baris itu, lalu tekan Pakai sesuai rencana lagi.`);
            }
            await packageLink(tx, invoice, { kind: "BARANG", serviceId: null, itemId: item.itemId, name: line.name, quantity: line.quantity }, source, line.id);
            await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice: 0, priceNote: null, ...NO_DISCOUNT, patientPackageItemId: item.id, packageSourceLineId: null } });
            left -= line.quantity;
          }
          if (left > 0) {
            await packageLink(tx, invoice, { kind: "BARANG", serviceId: null, itemId: item.itemId, name: item.serviceName, quantity: left }, source, null);
            await tx.invoiceLine.create({
              data: { invoiceId, kind: "BARANG", name: item.serviceName, quantity: left, unitPrice: 0, itemId: item.itemId, patientPackageItemId: item.id, sortOrder: await nextSortOrder(tx, invoiceId) },
            });
          }
          added.push({ name: item.serviceName, unit: item.unit, quantity });
        }
      });
      return { version, summary: `Pakai sesuai rencana paket ${pkg.name}: ${visitContentsLabel(added)}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/**
 * Harga katalog baris yang dilepas dari paket: harga layanan untuk treatment; harga jual dan promo yang berlaku untuk
 * barang, sama seperti saat barang ditambahkan.
 */
async function releaseLines(tx: Prisma.TransactionClient, lineIds: readonly string[]): Promise<void> {
  const lines = await tx.invoiceLine.findMany({ where: { id: { in: [...lineIds] } }, select: { id: true, quantity: true, serviceId: true, itemId: true } });
  const unlink = { priceNote: null, patientPackageItemId: null, packageSourceLineId: null };
  for (const line of lines) {
    if (line.itemId) {
      const item = await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true, ...PROMO_SELECT } });
      const unitPrice = item?.sellPrice ?? 0;
      const promo = item ? promoDiscount(item, { quantity: line.quantity, unitPrice }, witaDateString(new Date())) : null;
      const discount = promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" as const } : NO_DISCOUNT;
      await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice, ...discount, ...unlink } });
      continue;
    }
    const price = line.serviceId ? ((await tx.service.findUnique({ where: { id: line.serviceId }, select: { promoPrice: true } }))?.promoPrice ?? 0) : 0;
    await tx.invoiceLine.update({ where: { id: line.id }, data: { unitPrice: price, ...unlink } });
  }
}

/** Lepas paket dari baris (rencana paket keputusan 8): harga kembali ke harga katalog layanan atau barang. */
export async function releasePackageSession(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: { id: true, name: true, patientPackageItemId: true, packageSourceLineId: true },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (!line.patientPackageItemId && !line.packageSourceLineId) throw new UserFacingError("Baris ini tidak memakai sesi paket.");
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await releaseLines(tx, [line.id]);
      });
      return { version, summary: `Lepas paket dari ${line.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Pelaksana baris treatment (spec harga modal 6, M7): boleh diganti atau dikosongkan; baris tanpa pelaksana tidak berkomisi. */
export async function setLinePerformer(input: { invoiceId: string; version: number; lineId: string; performerId: string | null }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true, kind: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.kind !== "TREATMENT") throw new UserFacingError("Pelaksana hanya untuk baris treatment.");
      let performer: { id: string; name: string } | null = null;
      if (input.performerId) {
        performer = await tx.staff.findFirst({ where: { id: String(input.performerId), isActive: true, role: { in: ["DOKTER", "TERAPIS"] } }, select: { id: true, name: true } });
        if (!performer) throw new UserFacingError("Pelaksana tidak ditemukan atau nonaktif.");
      }
      await tx.invoiceLine.update({ where: { id: line.id }, data: { performerId: performer?.id ?? null, performerName: performer?.name ?? null } });
      return { version, summary: `Pelaksana ${line.name}: ${performer?.name ?? "kosong"}` };
    });
    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/**
 * Ubah jumlah dan harga satu baris draf. Harga baris katalog yang diubah dari harga semula dan
 * dari harga katalog sekarang wajib catatan; mengembalikannya ke harga katalog menghapus catatan.
 */
export async function updateInvoiceLine(input: {
  invoiceId: string;
  version: number;
  lineId: string;
  quantity: number;
  unitPrice: number;
  priceNote: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: {
          id: true,
          name: true,
          quantity: true,
          unitPrice: true,
          priceNote: true,
          serviceId: true,
          itemId: true,
          dispensingLineId: true,
          discountAmount: true,
          discountReason: true,
          discountSource: true,
          kind: true,
          treatmentPackageId: true,
          patientPackageItemId: true,
          packageSourceLineId: true,
          dispensingLine: { select: { dispensing: { select: { source: true } } } },
        },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.dispensingLineId && input.quantity !== line.quantity) {
        throw new UserFacingError(line.dispensingLine?.dispensing.source === "DOKTER" ? PRESCRIPTION_QUANTITY : DISPENSED_QUANTITY);
      }
      if (line.kind === "PAKET" && input.quantity !== 1) throw new UserFacingError(PACKAGE_QUANTITY);
      if ((line.patientPackageItemId || line.packageSourceLineId) && input.unitPrice !== 0) throw new UserFacingError(PACKAGE_PRICE);

      const catalogPrice = line.itemId
        ? (await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true } }))?.sellPrice ?? null
        : line.treatmentPackageId
          ? (await tx.treatmentPackage.findUnique({ where: { id: line.treatmentPackageId }, select: { price: true } }))?.price ?? null
          : line.serviceId
            ? (await tx.service.findUnique({ where: { id: line.serviceId }, select: { promoPrice: true } }))?.promoPrice ?? null
            : null;
      const catalogLinked = line.itemId !== null || line.serviceId !== null || line.treatmentPackageId !== null;
      const price = typeof input.unitPrice === "number" ? input.unitPrice : Number.NaN;
      const needsNote = catalogLinked && price !== line.unitPrice && price !== (catalogPrice ?? line.unitPrice);
      const checked = validateLineEdit(input, { needsNote });
      if (!checked.ok) throw new UserFacingError(checked.message);

      const atCatalogPrice = catalogLinked && checked.value.unitPrice === (catalogPrice ?? line.unitPrice);
      const priceNote = atCatalogPrice ? null : (checked.value.priceNote ?? (checked.value.unitPrice === line.unitPrice ? line.priceNote : null));
      // Diskon baris mengikuti harga baris baru: promo dihitung ulang, diskon manual dipotong ke harga baris (spec 5.1).
      const gross = checked.value.quantity * checked.value.unitPrice;
      let discount: { discountAmount: number; discountReason: string | null; discountSource: "PROMO" | "MANUAL" | null } = {
        discountAmount: Math.min(line.discountAmount, gross),
        discountReason: line.discountReason,
        discountSource: line.discountSource,
      };
      if (line.discountSource === "PROMO" && line.itemId) {
        const item = await tx.stockItem.findUnique({ where: { id: line.itemId }, select: PROMO_SELECT });
        const promo = item ? promoDiscount(item, checked.value, witaDateString(new Date())) : null;
        discount = promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" } : { ...NO_DISCOUNT };
      }
      if (discount.discountAmount === 0) discount = { ...NO_DISCOUNT };
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({
          where: { id: line.id },
          data: { quantity: checked.value.quantity, unitPrice: checked.value.unitPrice, priceNote, ...discount },
        });
      });
      return { version, summary: `Ubah baris ${line.name}: ×${checked.value.quantity}, Rp ${checked.value.unitPrice}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

export async function removeInvoiceLine(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: {
          id: true,
          name: true,
          dispensingLineId: true,
          dispensingLine: { select: { dispensing: { select: { source: true } } } },
          packageSourceUses: { select: { id: true } },
        },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.dispensingLineId) {
        throw new UserFacingError(line.dispensingLine?.dispensing.source === "DOKTER" ? PRESCRIPTION_REMOVE : DISPENSED_REMOVE);
      }
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        // Baris yang memakai jatah paket ini kembali ke harga katalog (spec paket barang 4).
        if (line.packageSourceUses.length > 0) await releaseLines(tx, line.packageSourceUses.map((use) => use.id));
        await tx.invoiceLine.delete({ where: { id: line.id } });
      });
      return { version, summary: `Hapus baris ${line.name}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/**
 * Resepsionis mengurangi atau menghapus (jumlah 0) baris dari resep dokter dengan alasan (spec resep dokter 4, RD5).
 * Jumlah yang ditagih dan alasannya disimpan di baris penyerahan supaya dokter melihatnya di catatan kunjungan.
 */
export async function reducePrescriptionLine(input: {
  invoiceId: string;
  version: number;
  lineId: string;
  quantity: number;
  reason: string | null;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input?.lineId ?? ""), invoiceId },
        select: {
          id: true,
          name: true,
          unitPrice: true,
          itemId: true,
          discountAmount: true,
          discountReason: true,
          discountSource: true,
          dispensingLine: { select: { id: true, quantity: true, dispensing: { select: { source: true } } } },
        },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (!line.dispensingLine || line.dispensingLine.dispensing.source !== "DOKTER") {
        throw new UserFacingError("Hanya baris dari resep dokter yang bisa dikurangi di sini.");
      }
      const prescribed = line.dispensingLine.quantity;
      const checked = validateReduction(input, { prescribed });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const { quantity, reason } = checked.value;

      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        if (quantity === 0) {
          await tx.invoiceLine.delete({ where: { id: line.id } });
          return;
        }
        // Diskon mengikuti jumlah baru: promo dihitung ulang, diskon manual dipotong ke harga baris (sama dengan updateInvoiceLine).
        const gross = quantity * line.unitPrice;
        let discount: { discountAmount: number; discountReason: string | null; discountSource: "PROMO" | "MANUAL" | null } = {
          discountAmount: Math.min(line.discountAmount, gross),
          discountReason: line.discountReason,
          discountSource: line.discountSource,
        };
        if (line.discountSource === "PROMO" && line.itemId) {
          const item = await tx.stockItem.findUnique({ where: { id: line.itemId }, select: PROMO_SELECT });
          const promo = item ? promoDiscount(item, { quantity, unitPrice: line.unitPrice }, witaDateString(new Date())) : null;
          discount = promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" } : { ...NO_DISCOUNT };
        }
        if (discount.discountAmount === 0) discount = { ...NO_DISCOUNT };
        await tx.invoiceLine.update({ where: { id: line.id }, data: { quantity, ...discount } });
      });
      // Jumlah resep lagi (reason null): pengurangan dibatalkan dan keterangan untuk dokter hilang.
      const restored = quantity === prescribed;
      await tx.dispensingLine.update({
        where: { id: line.dispensingLine.id },
        data: restored ? { billedQuantity: null, billingNote: null } : { billedQuantity: quantity, billingNote: reason },
      });
      const summary = restored ? `Kembalikan ${line.name} ke jumlah resep (${prescribed})` : `Kurangi ${line.name}: ×${quantity} dari ${prescribed} — ${reason}`;
      return { version, summary };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/**
 * Mengembalikan obat resep dokter yang dijadikan 0 ke draf tagihan dengan jumlah resep, harga jual katalog, dan promo
 * hari ini (spec resep dokter 4). Keterangan pengurangan untuk dokter ikut dihapus.
 */
export async function restorePrescriptionLine(input: { invoiceId: string; version: number; dispensingLineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input?.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId }, select: { appointmentId: true } });
      const dispensingLine = invoice.appointmentId
        ? await tx.dispensingLine.findFirst({
            where: { id: String(input?.dispensingLineId ?? ""), dispensing: { appointmentId: invoice.appointmentId, source: "DOKTER" } },
            select: { id: true, dispensingId: true, itemName: true, quantity: true, billedQuantity: true, invoiceLine: { select: { id: true } } },
          })
        : null;
      if (!dispensingLine) throw new UserFacingError("Obat resep tidak ditemukan. Muat ulang halaman.");
      if (dispensingLine.invoiceLine) throw new UserFacingError("Obat ini sudah ada di tagihan.");

      const handed = (await handedInvoiceLines(tx, dispensingLine.dispensingId)).find((line) => line.dispensingLineId === dispensingLine.id);
      if (!handed) throw new UserFacingError("Obat resep tidak ditemukan. Muat ulang halaman.");
      const last = await tx.invoiceLine.aggregate({ where: { invoiceId }, _max: { sortOrder: true } });
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.create({ data: { ...handed, invoiceId, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
      });
      await tx.dispensingLine.update({ where: { id: dispensingLine.id }, data: { billedQuantity: null, billingNote: null } });
      return { version, summary: `Kembalikan ${dispensingLine.itemName}: ×${dispensingLine.quantity}` };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Menyalin ulang harga katalog saat ini ke baris katalog di draf (spec tagihan 4.2). Baris bebas tidak disentuh. */
export async function refreshCatalogPrices(input: { invoiceId: string; version: number }): Promise<ActionResult<{ version: number; updated: number }>> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:manage");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const lines = await tx.invoiceLine.findMany({
        where: { invoiceId, patientPackageItemId: null, packageSourceLineId: null, OR: [{ itemId: { not: null } }, { serviceId: { not: null } }, { treatmentPackageId: { not: null } }] },
        select: { id: true, quantity: true, unitPrice: true, itemId: true, serviceId: true, treatmentPackageId: true, discountAmount: true, discountSource: true },
      });
      const today = witaDateString(new Date());
      let updated = 0;
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        for (const line of lines) {
          const item = line.itemId ? await tx.stockItem.findUnique({ where: { id: line.itemId }, select: { sellPrice: true, ...PROMO_SELECT } }) : null;
          const price = line.itemId
            ? (item?.sellPrice ?? null)
            : line.treatmentPackageId
              ? ((await tx.treatmentPackage.findUnique({ where: { id: line.treatmentPackageId }, select: { price: true } }))?.price ?? null)
              : ((await tx.service.findUnique({ where: { id: line.serviceId! }, select: { promoPrice: true } }))?.promoPrice ?? null);
          const priceChanged = price !== null && price !== line.unitPrice;
          const unitPrice = priceChanged ? price : line.unitPrice;
          const gross = line.quantity * unitPrice;
          // Promo diperbarui sesuai hari ini; diskon manual tidak disentuh selain dipotong ke harga baris (spec 5.1).
          let discount: Record<string, unknown> = {};
          if (line.discountSource === "MANUAL") {
            if (line.discountAmount > gross) discount = gross > 0 ? { discountAmount: gross } : { ...NO_DISCOUNT };
          } else if (line.itemId) {
            const promo = item ? promoDiscount(item, { quantity: line.quantity, unitPrice }, today) : null;
            const next = promo ? { discountAmount: promo.amount, discountReason: promo.reason, discountSource: "PROMO" as const } : { ...NO_DISCOUNT };
            if (next.discountAmount !== line.discountAmount || (promo === null) !== (line.discountSource === null)) discount = next;
          }
          if (!priceChanged && Object.keys(discount).length === 0) continue;
          await tx.invoiceLine.update({ where: { id: line.id }, data: { ...(priceChanged ? { unitPrice, priceNote: null } : {}), ...discount } });
          updated += 1;
        }
      });
      return { version, updated };
    });

    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: `Segarkan harga katalog: ${result.updated} baris` });
    revalidateInvoices(invoiceId);
    return result;
  });
}

/**
 * Diskon draf (spec tagihan 3.2, TG9). Resepsionis sampai 20% dari subtotal; Admin Keuangan dan
 * Super Admin boleh lebih. Jenis kosong atau nilai 0 menghapus diskon.
 */
export async function setInvoiceDiscount(input: {
  invoiceId: string;
  version: number;
  kind: DiscountKindValue | null;
  value: number;
  reason: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await requireCapability("invoice:read");
    const canExceed = can(actor.role, "invoice:correct");
    if (!can(actor.role, "invoice:manage") && !canExceed) throw new UserFacingError("Anda tidak berhak mengubah diskon.");
    const invoiceId = String(input.invoiceId ?? "");

    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, select: { quantity: true, unitPrice: true, discountAmount: true, discountSource: true } });
      const checked = validateDiscount(input, {
        subtotal: invoiceSubtotal(lines),
        grossSubtotal: invoiceGrossSubtotal(lines),
        otherLimited: manualItemDiscount(lines),
        canExceed,
      });
      if (!checked.ok) throw new UserFacingError(checked.message);
      const discount = checked.value;
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          discountKind: discount.kind,
          discountValue: discount.value,
          discountReason: discount.reason,
          discountByName: discount.kind ? actor.name : null,
        },
      });
      return { version, summary: discount.kind ? `Diskon ${discount.value}${discount.kind === "PERSEN" ? "%" : ""}: ${discount.reason}` : "Diskon dihapus" };
    });

    await recordAudit({ actor, action: "invoice.discount", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

/** Diskon draf boleh diberi resepsionis (dalam batas) dan Admin Keuangan (di atas batas), sama dengan setInvoiceDiscount. */
async function discountActor() {
  const actor = await requireCapability("invoice:read");
  if (!can(actor.role, "invoice:manage") && !can(actor.role, "invoice:correct")) throw new UserFacingError("Anda tidak berhak mengubah diskon.");
  return actor;
}

/** Diskon manual satu baris draf (spec perbaikan tagihan 5.2); batas gabungan 20% dijaga guardDiscount. */
export async function setLineDiscount(input: {
  invoiceId: string;
  version: number;
  lineId: string;
  kind: DiscountKindValue;
  value: number;
  reason: string;
}): Promise<EditResult> {
  return runAction(async () => {
    const actor = await discountActor();
    const invoiceId = String(input?.invoiceId ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({
        where: { id: String(input.lineId ?? ""), invoiceId },
        select: { id: true, name: true, quantity: true, unitPrice: true, patientPackageItemId: true, packageSourceLineId: true },
      });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      if (line.patientPackageItemId || line.packageSourceLineId) throw new UserFacingError(PACKAGE_DISCOUNT);
      const checked = validateLineDiscount(input, { gross: line.quantity * line.unitPrice });
      if (!checked.ok) throw new UserFacingError(checked.message);
      await guardDiscount(
        tx,
        invoiceId,
        can(actor.role, "invoice:correct"),
        async () => {
          await tx.invoiceLine.update({ where: { id: line.id }, data: { discountAmount: checked.value.amount, discountReason: checked.value.reason, discountSource: "MANUAL" } });
        },
        OVER_LIMIT,
      );
      return { version, summary: `Diskon baris ${line.name}: ${formatRupiah(checked.value.amount)} (${checked.value.reason})` };
    });
    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}

export async function clearLineDiscount(input: { invoiceId: string; version: number; lineId: string }): Promise<EditResult> {
  return runAction(async () => {
    const actor = await discountActor();
    const invoiceId = String(input?.invoiceId ?? "");
    const result = await prisma.$transaction(async (tx) => {
      const version = await touchDraft(tx, invoiceId, input.version);
      const line = await tx.invoiceLine.findFirst({ where: { id: String(input.lineId ?? ""), invoiceId }, select: { id: true, name: true } });
      if (!line) throw new UserFacingError("Baris tidak ditemukan.");
      await guardDiscount(tx, invoiceId, can(actor.role, "invoice:correct"), async () => {
        await tx.invoiceLine.update({ where: { id: line.id }, data: { discountAmount: 0, discountReason: null, discountSource: null } });
      });
      return { version, summary: `Hapus diskon baris ${line.name}` };
    });
    await recordAudit({ actor, action: "invoice.update", entity: "Invoice", entityId: invoiceId, summary: result.summary });
    revalidateInvoices(invoiceId);
    return { version: result.version };
  });
}
