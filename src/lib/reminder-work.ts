import { REMINDER_REPLY_LABEL, type MessageKind, type ReminderReplyValue } from "./booking-messages";
import { MAX_LOOKBACK_DAYS } from "./confirmation-window";
import { formatShortIndonesianDate } from "./format";
import {
  addDaysToDateString,
  combineWitaDateAndMinutes,
  minutesToTimeLabel,
  witaDateString,
  witaMinutesOfDay,
  witaWeekday,
} from "./time";

/** Satu catatan `AppointmentMessage`, cukup untuk menentukan kotak dan keterangan. */
export type MessageRecord = {
  id: string;
  kind: MessageKind;
  scheduledFor: Date;
  sentAt: Date;
  sentByName: string;
  revokedAt: Date | null;
  reply: ReminderReplyValue | null;
};

/**
 * Catatan berlaku: belum dibatalkan, dan dikirim untuk jadwal booking saat
 * ini (pindah jadwal menggugurkan catatan lama). Yang terakhir yang dipakai.
 */
export function latestValidMessage(
  messages: readonly MessageRecord[],
  kind: MessageKind,
  startAt: Date,
): MessageRecord | null {
  let latest: MessageRecord | null = null;
  for (const message of messages) {
    if (message.kind !== kind || message.revokedAt || message.scheduledFor.getTime() !== startAt.getTime()) continue;
    if (!latest || message.sentAt.getTime() > latest.sentAt.getTime()) latest = message;
  }
  return latest;
}

/**
 * Hari buka terakhir sebelum tanggal jadwal (WITA, "YYYY-MM-DD"). Minggu dan
 * tanggal libur dilewati: jadwal Senin diingatkan Sabtu (PRD F17, spec C2 4.2).
 */
export function reminderDay(date: string, closedDates: ReadonlySet<string>): string {
  let day = addDaysToDateString(date, -1);
  for (let step = 0; step < MAX_LOOKBACK_DAYS; step += 1) {
    const closed = witaWeekday(combineWitaDateAndMinutes(day, 12 * 60)) === 0 || closedDates.has(day);
    if (!closed) return day;
    day = addDaysToDateString(day, -1);
  }
  return day;
}

export type WorkBooking = { startAt: Date; messages: readonly MessageRecord[] };

export type ReminderGroups<T> = {
  confirm: T[];
  remind: (T & { reminderDay: string; overdue: boolean; shifted: boolean })[];
  reminded: (T & { reminder: MessageRecord })[];
};

/**
 * Tiga kotak halaman Pengingat (spec C2 bagian 4). Pemanggil hanya mengirim
 * booking Terkonfirmasi. Booking tanpa konfirmasi yang berlaku hanya masuk
 * kotak 1: konfirmasi yang dikirim pada hari pengingat sudah cukup mengingatkan.
 */
export function groupReminderWork<T extends WorkBooking>(
  bookings: readonly T[],
  context: { now: Date; closedDates: ReadonlySet<string> },
): ReminderGroups<T> {
  const today = witaDateString(context.now);
  const groups: ReminderGroups<T> = { confirm: [], remind: [], reminded: [] };

  for (const booking of bookings) {
    if (booking.startAt.getTime() <= context.now.getTime()) continue;

    const confirmation = latestValidMessage(booking.messages, "KONFIRMASI", booking.startAt);
    if (!confirmation) {
      groups.confirm.push(booking);
      continue;
    }

    const reminder = latestValidMessage(booking.messages, "PENGINGAT", booking.startAt);
    if (reminder) {
      groups.reminded.push({ ...booking, reminder });
      continue;
    }

    const date = witaDateString(booking.startAt);
    const day = reminderDay(date, context.closedDates);
    // Pasien yang baru menerima konfirmasi pada hari pengingat tidak perlu diingatkan lagi.
    if (witaDateString(confirmation.sentAt) >= day) continue;
    if (day > today) continue;
    groups.remind.push({
      ...booking,
      reminderDay: day,
      overdue: day < today,
      shifted: day !== addDaysToDateString(date, -1),
    });
  }

  const byStart = (a: WorkBooking, b: WorkBooking) => a.startAt.getTime() - b.startAt.getTime();
  groups.confirm.sort(byStart);
  groups.reminded.sort(byStart);
  groups.remind.sort((a, b) => (a.overdue === b.overdue ? byStart(a, b) : a.overdue ? -1 : 1));
  return groups;
}

/** Keterangan kecil di baris booking (spec C2 4.5). */
export function messageStatusLabels(messages: readonly MessageRecord[], startAt: Date, now: Date): string[] {
  const today = witaDateString(now);
  const when = (date: Date) => {
    const time = minutesToTimeLabel(witaMinutesOfDay(date));
    return witaDateString(date) === today ? time : `${formatShortIndonesianDate(date)} ${time}`;
  };

  const labels: string[] = [];
  const transfer = latestValidMessage(messages, "INSTRUKSI_TRANSFER", startAt);
  if (transfer) labels.push(`Instruksi transfer terkirim ${when(transfer.sentAt)}`);
  const quizLink = latestValidMessage(messages, "LINK_KUIS", startAt);
  if (quizLink) labels.push(`Link kuis terkirim ${when(quizLink.sentAt)}`);
  const confirmation = latestValidMessage(messages, "KONFIRMASI", startAt);
  if (confirmation) labels.push(`Konfirmasi terkirim ${when(confirmation.sentAt)} · ${confirmation.sentByName}`);
  const reminder = latestValidMessage(messages, "PENGINGAT", startAt);
  if (reminder) {
    labels.push(
      `Diingatkan ${when(reminder.sentAt)}${reminder.reply ? ` · ${REMINDER_REPLY_LABEL[reminder.reply]}` : ""}`,
    );
  }
  return labels;
}
