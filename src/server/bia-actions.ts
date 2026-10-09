"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { biaAccess, parseBiaInput, type BiaInput } from "@/lib/bia";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { validateReason } from "@/lib/stock";
import { recordAudit } from "@/server/audit";
import { ensureActiveMeasurement } from "@/server/bia-upload";
import { isUniqueViolation } from "@/server/db-errors";
import { requireCapability } from "@/server/session";

function revalidate(patientId: string) {
  safeRevalidatePath("/admin/booking");
  safeRevalidatePath("/admin/kunjungan");
  safeRevalidatePath(`/admin/pasien/${patientId}`);
}

/** Memulai pengukuran untuk booking ini (atau mengembalikan yang aktif). Hanya peran yang menulis catatan klinis. */
export async function startBiaMeasurement(appointmentId: string): Promise<ActionResult<{ measurementId: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const appointment = await prisma.appointment.findUnique({
      where: { id: String(appointmentId ?? "") },
      select: { id: true, status: true, channel: true, patientId: true },
    });
    if (!appointment) throw new UserFacingError("Booking tidak ditemukan.");
    if (!appointment.patientId) throw new UserFacingError("Booking ini belum punya pasien. Cocokkan pasien dulu.");
    if (!biaAccess(actor.role, appointment).editNumbers) throw new UserFacingError("Hasil BIA hanya untuk booking klinik yang pasiennya sudah check-in.");
    const patientId = appointment.patientId;
    for (let attempt = 0; ; attempt += 1) {
      try {
        const measurementId = await prisma.$transaction((tx) => ensureActiveMeasurement(tx, { appointmentId: appointment.id, patientId, actor }));
        revalidate(patientId);
        return { measurementId };
      } catch (error) {
        if (isUniqueViolation(error) && attempt === 0) continue;
        throw error;
      }
    }
  });
}

/** Menyimpan tujuh angka (spec hasil BIA 6.2). Versi lama ditolak; angka yang sudah tersimpan terkunci setelah kunjungan final. */
export async function saveBiaNumbers(input: {
  measurementId: string;
  version: number;
  numbers: BiaInput;
  note: string;
}): Promise<ActionResult<{ version: number }>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const parsed = parseBiaInput(input?.numbers, input?.note ?? "");
    if (!parsed.ok) throw new UserFacingError(parsed.message);
    const id = String(input?.measurementId ?? "");

    const row = await prisma.biaMeasurement.findUnique({
      where: { id },
      select: { id: true, patientId: true, voidedAt: true, numbersAt: true, appointment: { select: { code: true, status: true, channel: true } } },
    });
    if (!row) throw new UserFacingError("Pengukuran tidak ditemukan.");
    if (row.voidedAt) throw new UserFacingError("Pengukuran ini sudah dibatalkan.");
    if (!biaAccess(actor.role, row.appointment).editNumbers) throw new UserFacingError("Anda tidak bisa mengisi angka BIA untuk booking ini.");
    if (row.appointment.status === "SELESAI" && row.numbersAt) {
      throw new UserFacingError("Kunjungan sudah final. Angka yang sudah tersimpan tidak bisa diubah; batalkan pengukuran lalu isi yang baru.");
    }

    const { count } = await prisma.biaMeasurement.updateMany({
      where: { id, version: Number(input.version), voidedAt: null },
      data: {
        ...parsed.value.numbers,
        note: parsed.value.note,
        numbersById: actor.staffId,
        numbersByName: actor.name,
        numbersAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new UserFacingError("Angka BIA baru diubah di tempat lain. Muat ulang halaman.");
    await recordAudit({ actor, action: "bia.numbers.save", entity: "BiaMeasurement", entityId: id, summary: row.appointment.code });
    revalidate(row.patientId);
    return { version: Number(input.version) + 1 };
  });
}

/** Membatalkan pengukuran beserta alasannya (tidak dihapus; berkasnya tetap tercatat). */
export async function voidBiaMeasurement(input: { measurementId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.measurementId ?? "");
    const row = await prisma.biaMeasurement.findUnique({
      where: { id },
      select: { patientId: true, voidedAt: true, appointment: { select: { code: true, status: true, channel: true } } },
    });
    if (!row) throw new UserFacingError("Pengukuran tidak ditemukan.");
    if (row.voidedAt) throw new UserFacingError("Pengukuran ini sudah dibatalkan.");
    if (!biaAccess(actor.role, row.appointment).voidAny) throw new UserFacingError("Anda tidak bisa membatalkan hasil BIA untuk booking ini.");
    const { count } = await prisma.biaMeasurement.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: actor.staffId, voidedByName: actor.name, voidReason: reason.value },
    });
    if (count === 0) throw new UserFacingError("Pengukuran ini sudah dibatalkan.");
    await recordAudit({ actor, action: "bia.void", entity: "BiaMeasurement", entityId: id, summary: row.appointment.code });
    revalidate(row.patientId);
  });
}

/** Membatalkan satu berkas. Resepsionis hanya untuk unggahannya sendiri dan hanya selama booking HADIR. */
export async function voidBiaFile(input: { fileId: string; reason: string }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("bia:upload");
    const reason = validateReason(input?.reason);
    if (!reason.ok) throw new UserFacingError(reason.message);
    const id = String(input?.fileId ?? "");
    const file = await prisma.biaFile.findUnique({
      where: { id },
      select: {
        voidedAt: true,
        uploadedById: true,
        originalName: true,
        measurement: { select: { id: true, patientId: true, appointment: { select: { code: true, status: true, channel: true } } } },
      },
    });
    if (!file) throw new UserFacingError("Berkas tidak ditemukan.");
    if (file.voidedAt) throw new UserFacingError("Berkas ini sudah dibatalkan.");
    const access = biaAccess(actor.role, file.measurement.appointment);
    if (!access.voidAny) {
      if (!access.voidOwnFile) throw new UserFacingError("Anda tidak bisa membatalkan berkas ini.");
      if (file.uploadedById !== actor.staffId) throw new UserFacingError("Anda hanya bisa membatalkan unggahan Anda sendiri.");
    }
    const { count } = await prisma.biaFile.updateMany({
      where: { id, voidedAt: null },
      data: { voidedAt: new Date(), voidedById: actor.staffId, voidedByName: actor.name, voidReason: reason.value },
    });
    if (count === 0) throw new UserFacingError("Berkas ini sudah dibatalkan.");
    await recordAudit({
      actor,
      action: "bia.file.void",
      entity: "BiaMeasurement",
      entityId: file.measurement.id,
      summary: `${file.measurement.appointment.code} · ${file.originalName}`,
    });
    revalidate(file.measurement.patientId);
  });
}
