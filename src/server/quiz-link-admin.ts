"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import { quizLinkMessageText, type WhatsAppMessage } from "@/lib/booking-messages";
import { prisma } from "@/lib/db";
import { quizKindFor, quizLinkState, quizLinkVersion } from "@/lib/quiz-link";
import { safeRevalidatePath } from "@/lib/revalidate";
import { bookingServiceName } from "@/lib/transfer-instruction";
import { buildWhatsAppLinkTo } from "@/lib/whatsapp";
import { recordAudit } from "@/server/audit";
import { quizLinkUrl } from "@/server/quiz-link-code";
import { hasCompletedFullIntake, loadLinkBooking, type LinkBooking } from "@/server/quiz-link-store";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

/** Isi dialog "Link kuis" (spec C3 4.2). `scheduledFor` adalah jadwal yang tertulis di teks WA. */
export type QuizLinkInfo = { url: string; message: WhatsAppMessage; scheduledFor: Date };

function infoFor(booking: LinkBooking, version: number): QuizLinkInfo {
  const url = quizLinkUrl(publicSiteUrl(), booking.id, version);
  // quizLinkState OPEN menjamin booking punya pasien.
  const text = quizLinkMessageText({
    patientName: booking.patient!.name,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    link: url,
  });
  return { url, message: { text, link: buildWhatsAppLinkTo(booking.patient!.whatsapp, text) }, scheduledFor: booking.startAt };
}

/** Link kuis sebuah booking, atau null bila kuis sudah diisi atau booking tidak aktif. */
export async function getQuizLink(appointmentId: string): Promise<ActionResult<QuizLinkInfo | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const booking = await loadLinkBooking(appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (quizLinkState(booking, new Date()) !== "OPEN") return null;
    return infoFor(booking, quizLinkVersion(booking));
  });
}

/**
 * "Ganti link": versi naik, sehingga link lama langsung tidak berlaku. Untuk
 * booking yang belum punya baris isian, baris MENUNGGU_DIISI dibuat untuk
 * menyimpan versinya; jenis kuisnya ditetapkan ulang saat Kirim.
 */
export async function rotateQuizLink(appointmentId: string): Promise<ActionResult<QuizLinkInfo>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const booking = await loadLinkBooking(appointmentId);
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (quizLinkState(booking, new Date()) !== "OPEN") {
      throw new UserFacingError("Link kuis tidak tersedia untuk booking ini.");
    }

    const kind = quizKindFor(await hasCompletedFullIntake(booking.patientId!));
    const intake = await prisma.intake.upsert({
      where: { appointmentId },
      create: { appointmentId, patientId: booking.patientId, status: "MENUNGGU_DIISI", kind, linkVersion: 1 },
      update: { linkVersion: { increment: 1 } },
      select: { linkVersion: true },
    });

    await recordAudit({
      actor,
      action: "intake.link-rotate",
      entity: "Appointment",
      entityId: appointmentId,
      summary: `${booking.code} versi ${intake.linkVersion}`,
    });
    safeRevalidatePath("/admin/booking");
    safeRevalidatePath("/admin/pengingat");
    return infoFor(booking, intake.linkVersion);
  });
}
