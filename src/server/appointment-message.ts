"use server";

import { runAction, UserFacingError, type ActionResult } from "@/lib/action-result";
import {
  confirmationMessageFor,
  MESSAGE_KINDS,
  REMINDER_REPLIES,
  type BookingMessage,
  type MessageKind,
  type ReminderReplyValue,
} from "@/lib/booking-messages";
import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";
import { needsTransfer, transferInstructionFor } from "@/lib/transfer-instruction";
import { transferDeadlines } from "@/server/booking-expiry";
import { getClinicSetting } from "@/server/clinic-setting";
import { requireCapability } from "@/server/session";
import { publicSiteUrl } from "@/server/site-url";

/** Identitas pasien saja, tanpa catatan medis (spec 6.2). */
const MESSAGE_BOOKING_INCLUDE = {
  patient: { select: { name: true, whatsapp: true } },
  staff: { select: { name: true } },
  branch: { select: { name: true, address: true, mapsUrl: true } },
  service: { select: { name: true } },
} as const;

function revalidateMessageViews() {
  safeRevalidatePath("/admin/booking");
  safeRevalidatePath("/admin/pengingat");
}

/**
 * Pesan yang sebaiknya dikirim sekarang untuk booking ini: konfirmasi untuk
 * booking Terkonfirmasi, instruksi transfer untuk booking WA/telepon yang
 * belum transfer, atau null. Dipakai dialog setelah Verifikasi dan setelah
 * Pindah jadwal (spec C2 3.1, bagian 5).
 */
export async function getBookingMessage(appointmentId: string): Promise<ActionResult<BookingMessage | null>> {
  return runAction(async () => {
    await requireCapability("booking:manage");
    const booking = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: MESSAGE_BOOKING_INCLUDE,
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");

    if (booking.status === "TERKONFIRMASI") {
      const message = confirmationMessageFor(booking, publicSiteUrl());
      return message ? { kind: "KONFIRMASI", ...message } : null;
    }
    if (needsTransfer(booking)) {
      const [transferDeadline] = await transferDeadlines([booking]);
      const instruction = transferInstructionFor({ ...booking, transferDeadline }, await getClinicSetting());
      return instruction ? { kind: "INSTRUKSI_TRANSFER", text: instruction.text, link: instruction.link } : null;
    }
    return null;
  });
}

/**
 * Dipanggil saat tombol WA ditekan. Jadwal booking saat itu ikut disimpan,
 * sehingga pindah jadwal menggugurkan catatan ini (spec C2 bagian 6).
 */
export async function recordAppointmentMessage(input: {
  appointmentId: string;
  kind: MessageKind;
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    if (!(MESSAGE_KINDS as readonly string[]).includes(input.kind)) {
      throw new UserFacingError("Jenis pesan tidak dikenal.");
    }
    const booking = await prisma.appointment.findUnique({
      where: { id: input.appointmentId },
      select: { status: true, source: true, bookingFee: true, startAt: true },
    });
    if (!booking) throw new UserFacingError("Booking tidak ditemukan.");
    if (input.kind === "INSTRUKSI_TRANSFER") {
      if (!needsTransfer(booking)) throw new UserFacingError("Booking ini tidak sedang menunggu transfer.");
    } else if (booking.status !== "TERKONFIRMASI") {
      throw new UserFacingError("Booking ini belum terkonfirmasi.");
    }

    const created = await prisma.appointmentMessage.create({
      data: {
        appointmentId: input.appointmentId,
        kind: input.kind,
        scheduledFor: booking.startAt,
        sentById: actor.staffId,
        sentByName: actor.name,
      },
    });
    revalidateMessageViews();
    return { id: created.id };
  });
}

/** "Batalkan tanda": WA ternyata tidak terkirim. Catatan ditandai batal, tidak dihapus. */
export async function revokeAppointmentMessage(messageId: string): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    const { count } = await prisma.appointmentMessage.updateMany({
      where: { id: messageId, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actor.staffId, revokedByName: actor.name },
    });
    if (count === 0) throw new UserFacingError("Tanda ini sudah dibatalkan. Muat ulang halaman.");
    revalidateMessageViews();
  });
}

/** Balasan pasien atas pengingat yang masih berlaku (spec C2 4.3). Boleh diubah. */
export async function recordReminderReply(input: {
  messageId: string;
  reply: ReminderReplyValue;
}): Promise<ActionResult<void>> {
  return runAction(async () => {
    const actor = await requireCapability("booking:manage");
    if (!(REMINDER_REPLIES as readonly string[]).includes(input.reply)) {
      throw new UserFacingError("Balasan tidak dikenal.");
    }
    const message = await prisma.appointmentMessage.findUnique({
      where: { id: input.messageId },
      include: { appointment: { select: { startAt: true } } },
    });
    const valid =
      message !== null &&
      message.kind === "PENGINGAT" &&
      message.revokedAt === null &&
      message.scheduledFor.getTime() === message.appointment.startAt.getTime();
    if (!valid) throw new UserFacingError("Pengingat ini sudah tidak berlaku. Muat ulang halaman.");

    await prisma.appointmentMessage.update({
      where: { id: input.messageId },
      data: { reply: input.reply, repliedAt: new Date(), repliedById: actor.staffId, repliedByName: actor.name },
    });
    revalidateMessageViews();
  });
}
