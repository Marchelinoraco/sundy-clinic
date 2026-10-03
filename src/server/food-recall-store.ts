import { prisma } from "@/lib/db";
import {
  foodRecallLinkState,
  foodRecallMessageText,
  type FoodRecallLinkInfo,
  type FoodRecallLinkState,
} from "@/lib/food-recall";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { foodRecallUrl } from "@/server/food-recall-code";
import { publicSiteUrl } from "@/server/site-url";

// Tanpa "use server": berkas ini tidak boleh bisa dipanggil dari browser.
// Isi catatan (entries) sengaja tidak dipilih: info link juga dibuka resepsionis.
const LINK_SELECT = {
  id: true,
  status: true,
  recallDate: true,
  completedAt: true,
  appointment: {
    select: {
      id: true,
      status: true,
      startAt: true,
      patient: { select: { name: true, whatsapp: true } },
      encounter: { select: { status: true } },
    },
  },
} as const;

export function loadFoodRecallForLink(foodRecallId: string) {
  return prisma.foodRecall.findUnique({ where: { id: foodRecallId }, select: LINK_SELECT });
}

export function loadFoodRecallForAppointment(appointmentId: string) {
  return prisma.foodRecall.findUnique({ where: { appointmentId }, select: LINK_SELECT });
}

export type FoodRecallForLink = NonNullable<Awaited<ReturnType<typeof loadFoodRecallForLink>>>;

export function linkStateOf(row: FoodRecallForLink, now: Date): FoodRecallLinkState {
  return foodRecallLinkState(
    {
      appointmentStatus: row.appointment.status,
      startAt: row.appointment.startAt,
      encounterStatus: row.appointment.encounter?.status ?? null,
      completedAt: row.completedAt,
    },
    now,
  );
}

/** Info link untuk panel admin: QR, buka di tablet, kirim WA (spec 4.2), atau keadaannya bila tidak berlaku. */
export function foodRecallLinkInfo(row: FoodRecallForLink | null, now: Date): FoodRecallLinkInfo {
  if (!row) return { state: "NOT_OFFERED" };
  const filled = row.status === "DIISI";
  const state = linkStateOf(row, now);
  if (state !== "OPEN") return { state, filled };
  const url = foodRecallUrl(publicSiteUrl(), row.id);
  const patient = row.appointment.patient;
  const text = foodRecallMessageText({ patientName: patient?.name ?? "", link: url });
  return { state: "OPEN", filled, url, message: { text, link: patient ? buildWhatsAppLinkTo(patient.whatsapp, text) : null } };
}
