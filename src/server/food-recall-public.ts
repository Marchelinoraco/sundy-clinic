"use server";

import type { Prisma } from "@prisma/client";
import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { prisma } from "@/lib/db";
import {
  FOOD_RECALL_CLOSED,
  FOOD_RECALL_RECEIVED,
  recallDateLabel,
  validateCustomerEntries,
  type FoodRecallPage,
} from "@/lib/food-recall";
import { firstName } from "@/lib/quiz-link";
import { createRateLimiter } from "@/lib/rate-limit";
import { safeRevalidatePath } from "@/lib/revalidate";
import { recordAudit, SITE_PATIENT_ACTOR } from "@/server/audit";
import { isRecordLockedError } from "@/server/db-errors";
import { isValidFoodRecallCode, parseFoodRecallCode } from "@/server/food-recall-code";
import { linkStateOf, loadFoodRecallForLink, type FoodRecallForLink } from "@/server/food-recall-store";
import { guardRate } from "@/server/request-guard";

// Setiap ekspor berkas ini bisa dipanggil siapa pun dari browser tanpa login.
// Kode link adalah satu-satunya bukti, jadi diperiksa ulang di setiap aksi.

const pageLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
const submitLimiter = createRateLimiter({ limit: 10, windowMs: 10 * 60_000 });

const GENERIC_FAILURE = "Catatan gagal dikirim. Muat ulang halaman lalu coba lagi.";

async function foodRecallForCode(code: unknown): Promise<FoodRecallForLink | null> {
  const parsed = parseFoodRecallCode(code);
  if (!parsed || !isValidFoodRecallCode(code as string)) return null;
  return loadFoodRecallForLink(parsed.foodRecallId);
}

/** Isi halaman /food-recall: hanya nama depan dan tanggal kemarin (spec 4.3). */
export async function getFoodRecallPage(code: string): Promise<ActionResult<FoodRecallPage>> {
  return runAction(async () => {
    await guardRate(pageLimiter);
    const row = await foodRecallForCode(code);
    if (!row) return { state: "CLOSED" };
    const state = linkStateOf(row, new Date());
    if (state !== "OPEN") return { state };
    return {
      state: "OPEN",
      firstName: firstName(row.appointment.patient?.name ?? ""),
      recallDateLabel: recallDateLabel(row.recallDate.toISOString().slice(0, 10)),
    };
  });
}

/**
 * Kiriman customer (spec 4.2–4.3): menggantikan isian sebelumnya selama link
 * berlaku. Pembaruan bersyarat completedAt = null: bila dokter sudah melengkapi
 * lebih dulu, kiriman ini ditolak dan tambahan dokter tidak tertimpa.
 */
export async function submitFoodRecall(input: {
  code: string;
  entries: unknown;
  website: string;
}): Promise<ActionResult<{ state: "SUBMITTED" }>> {
  return runAction(async () => {
    await guardRate(submitLimiter);
    if (input?.website) throw new UserFacingError(GENERIC_FAILURE);

    const row = await foodRecallForCode(input?.code);
    if (!row) throw new UserFacingError(FOOD_RECALL_CLOSED);
    const state = linkStateOf(row, new Date());
    if (state === "RECEIVED") throw new UserFacingError(FOOD_RECALL_RECEIVED);
    if (state !== "OPEN") throw new UserFacingError(FOOD_RECALL_CLOSED);

    const checked = validateCustomerEntries(input?.entries);
    if (!checked.ok) throw new UserFacingError(checked.message);

    let updated: number;
    try {
      const result = await prisma.foodRecall.updateMany({
        where: { id: row.id, completedAt: null },
        data: { status: "DIISI", entries: checked.entries as Prisma.InputJsonValue, submittedAt: new Date() },
      });
      updated = result.count;
    } catch (error) {
      if (isRecordLockedError(error)) throw new UserFacingError(FOOD_RECALL_RECEIVED);
      throw error;
    }
    if (updated === 0) throw new UserFacingError(FOOD_RECALL_RECEIVED);

    await recordAudit({
      actor: SITE_PATIENT_ACTOR,
      action: "food-recall.submit",
      entity: "Appointment",
      entityId: row.appointment.id,
    });
    safeRevalidatePath("/admin/booking");
    return { state: "SUBMITTED" };
  });
}
