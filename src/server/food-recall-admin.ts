"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import { recallDateFor, validateStaffEntries, type FoodRecallLinkInfo } from "@/lib/food-recall";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit } from "@/server/audit";
import { isRecordLockedError } from "@/server/db-errors";
import { foodRecallLinkInfo, loadFoodRecallForAppointment } from "@/server/food-recall-store";
import { requireCapability } from "@/server/session";

const LOCKED = "Catatan dokter sudah final; food recall tidak bisa diubah.";
const NOT_CHECKED_IN = "Food recall hanya untuk customer yang sudah check-in.";

const recallDateValue = (startAt: Date) => new Date(`${recallDateFor(startAt)}T00:00:00Z`);

function loadBooking(appointmentId: unknown) {
  return prisma.appointment.findUnique({
    where: { id: String(appointmentId ?? "") },
    select: { id: true, code: true, status: true, startAt: true, encounter: { select: { id: true, status: true } } },
  });
}

/** Link food recall sebuah booking (spec 4.4). Tanpa isi catatan: resepsionis juga membukanya. */
export async function getFoodRecallLink(appointmentId: string): Promise<ActionResult<FoodRecallLinkInfo>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    return foodRecallLinkInfo(await loadFoodRecallForAppointment(String(appointmentId ?? "")), new Date());
  });
}

/** "Tawarkan food recall" untuk booking yang sudah check-in tanpa food recall (spec 4.4, 5.1). */
export async function offerFoodRecall(appointmentId: string): Promise<ActionResult<FoodRecallLinkInfo>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const booking = await loadBooking(appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.encounter?.status === "FINAL") throw new UserFacingError(LOCKED);
    if (booking.status !== "HADIR") throw new UserFacingError(NOT_CHECKED_IN);

    try {
      await prisma.foodRecall.upsert({
        where: { appointmentId: booking.id },
        create: { appointmentId: booking.id, recallDate: recallDateValue(booking.startAt) },
        update: {},
      });
    } catch (error) {
      if (isRecordLockedError(error)) throw new UserFacingError(LOCKED);
      throw error;
    }

    await recordAudit({ actor, action: "food-recall.offer", entity: "Appointment", entityId: booking.id, summary: booking.code });
    safeRevalidatePath("/admin/booking");
    return foodRecallLinkInfo(await loadFoodRecallForAppointment(booking.id), new Date());
  });
}

/**
 * Dokter melengkapi food recall dari halaman kunjungan (spec 5.3). Baris
 * customer tetap bertanda CUSTOMER, tambahan dokter bertanda DOKTER, dan
 * completedAt menutup link customer agar tambahan ini tidak tertimpa.
 */
export async function saveFoodRecallByStaff(input: { appointmentId: string; entries: unknown }): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("record:write");
    const checked = validateStaffEntries(input?.entries);
    if (!checked.ok) throw new UserFacingError(checked.message);
    const booking = await loadBooking(input?.appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (booking.encounter?.status === "FINAL") throw new UserFacingError(LOCKED);
    if (booking.status !== "HADIR") throw new UserFacingError(NOT_CHECKED_IN);

    const data = {
      status: "DIISI" as const,
      entries: checked.entries as Prisma.InputJsonValue,
      completedByStaffId: actor.staffId,
      completedByName: actor.name,
      completedAt: new Date(),
    };
    try {
      await prisma.foodRecall.upsert({
        where: { appointmentId: booking.id },
        create: { appointmentId: booking.id, recallDate: recallDateValue(booking.startAt), ...data },
        update: data,
      });
    } catch (error) {
      if (isRecordLockedError(error)) throw new UserFacingError(LOCKED);
      throw error;
    }

    await recordAudit({ actor, action: "food-recall.complete", entity: "Appointment", entityId: booking.id, summary: booking.code });
    if (booking.encounter) safeRevalidatePath(`/admin/kunjungan/${booking.encounter.id}`);
    safeRevalidatePath("/admin/booking");
  });
}
