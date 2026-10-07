"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { visitLines } from "@/lib/invoice";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isExclusionViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

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
        encounter: { select: { status: true, treatments: { orderBy: { sortOrder: "asc" }, select: { id: true, serviceId: true, serviceName: true } } } },
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

    try {
      const created = await prisma.invoice.create({
        data: {
          patientId: appointment.patientId,
          appointmentId: id,
          branchId: appointment.branchId,
          createdById: actor.staffId,
          createdByName: actor.name,
          lines: { create: lines.map((line, index) => ({ ...line, sortOrder: index })) },
        },
        select: { id: true },
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
