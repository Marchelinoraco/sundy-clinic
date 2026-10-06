import { CLINIC_NAME } from "./clinic";
import { confirmationDeadline } from "./confirmation-window";
import { formatRupiah, formatScheduleForMessage, formatShortIndonesianDate } from "./format";
import { onlineTransferText } from "./online-consultation";
import { formatBankAccount, type BankAccount, type BookingSourceValue } from "./payment";
import { quizLinkLines } from "./quiz-link";
import { minutesToTimeLabel, witaMinutesOfDay } from "./time";
import { buildWhatsAppLinkTo } from "./whatsapp";

/** Instruksi transfer untuk booking WA/telepon (spec C1 bagian 4). */
export type TransferInstruction = {
  text: string;
  /** Tautan wa.me ke nomor pasien, atau null bila nomornya tidak sah. */
  link: string | null;
  deadline: Date;
  /** Rekening di Pengaturan belum lengkap; teks memakai MISSING_BANK_ACCOUNT_LINE. */
  missingBankAccount: boolean;
};

/** Sumber booking yang pasiennya mentransfer setelah admin mencatat booking. */
export const TRANSFER_SOURCES = ["WHATSAPP", "TELEPON"] as const;

export const MISSING_BANK_ACCOUNT_LINE = "(rekening akan kami kirimkan)";

/**
 * Booking WA/telepon berbiaya yang belum diverifikasi: pasien masih harus
 * mentransfer. Booking situs tidak termasuk, karena customer sudah menerima
 * instruksinya di halaman sukses /daftar (spec C1 bagian 7).
 */
export function needsTransfer(booking: {
  source: BookingSourceValue;
  status: string;
  bookingFee: number | null;
}): boolean {
  return (
    booking.status === "MENUNGGU_KONFIRMASI" &&
    (TRANSFER_SOURCES as readonly string[]).includes(booking.source) &&
    booking.bookingFee !== null
  );
}

/**
 * 24 jam kerja sejak booking dibuat (Minggu dan libur tidak dihitung, sama
 * dengan booking situs), tetapi tidak pernah setelah jadwalnya sendiri. Hanya
 * tertulis di pesan: booking WA/telepon tidak dibatalkan otomatis (B5).
 */
export function transferDeadline(createdAt: Date, startAt: Date, closedDates: ReadonlySet<string>): Date {
  const deadline = confirmationDeadline(createdAt, closedDates);
  return deadline.getTime() < startAt.getTime() ? deadline : startAt;
}

export function transferInstructionText(input: {
  patientName: string;
  code: string;
  serviceName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  fee: number;
  deadline: Date;
  /** Baris rekening siap tampil (formatBankAccount), atau null bila belum lengkap. */
  bankAccount: string | null;
  /** Link kuis (spec C3 4.1); null bila kuis sudah diisi atau link tidak berlaku. */
  quizLink?: string | null;
}): string {
  const lines = [
    `Halo ${input.patientName}, booking Anda di ${CLINIC_NAME} sudah kami catat.`,
    `Kode: ${input.code}`,
    `Layanan: ${input.serviceName}`,
    `Jadwal: ${formatScheduleForMessage(input.startAt)}`,
    `Tenaga: ${input.staffName} · ${input.branchName}`,
    "",
    `Mohon transfer biaya booking ${formatRupiah(input.fee)} paling lambat ${formatScheduleForMessage(input.deadline)} ke:`,
    input.bankAccount ?? MISSING_BANK_ACCOUNT_LINE,
    "lalu kirim bukti transfer di chat ini.",
    "",
    "Biaya booking terpisah dari biaya layanan dan tidak dikembalikan, tetapi tetap berlaku bila Anda pindah jadwal paling lambat 2 jam sebelumnya.",
  ];
  if (input.quizLink) lines.push("", ...quizLinkLines(input.quizLink));
  return lines.join("\n");
}

/** Nama layanan di daftar dan pesan; booking lama bisa tanpa baris layanan. */
export function bookingServiceName(booking: {
  service: { name: string } | null;
  type: "KONSULTASI" | "TREATMENT";
}): string {
  return booking.service?.name ?? (booking.type === "KONSULTASI" ? "Konsultasi" : "Treatment");
}

/** Bagian booking yang dibutuhkan untuk menyusun instruksi; `transferDeadline` diisi server. */
export type TransferBooking = {
  code: string;
  type: "KONSULTASI" | "TREATMENT";
  startAt: Date;
  bookingFee: number | null;
  transferDeadline: Date | null;
  service: { name: string } | null;
  staff: { name: string };
  branch: { name: string };
  patient: { name: string; whatsapp: string } | null;
  /** Konsultasi online (spec konsultasi online 7.1): teksnya memakai total dan rentang waktu luang. */
  channel?: "KLINIK" | "ONLINE";
  servicePrice?: number | null;
  contactWindows?: readonly { startAt: Date; endAt: Date }[];
};

/** null bila booking tidak menunggu transfer (walk-in, tanpa biaya, situs, atau sudah diverifikasi). */
export function transferInstructionFor(
  booking: TransferBooking,
  bank: BankAccount,
  quizLink: string | null = null,
): TransferInstruction | null {
  if (!booking.transferDeadline || booking.bookingFee === null || !booking.patient) return null;
  const bankAccount = formatBankAccount(bank);
  const text =
    booking.channel === "ONLINE"
      ? onlineTransferText({
          patientName: booking.patient.name,
          code: booking.code,
          doctorName: booking.staff.name,
          windows: booking.contactWindows ?? [],
          bookingFee: booking.bookingFee,
          servicePrice: booking.servicePrice ?? 0,
          deadline: booking.transferDeadline,
          bankLine: bankAccount ?? MISSING_BANK_ACCOUNT_LINE,
          quizLink,
        })
      : transferInstructionText({
          patientName: booking.patient.name,
          code: booking.code,
          serviceName: bookingServiceName(booking),
          startAt: booking.startAt,
          staffName: booking.staff.name,
          branchName: booking.branch.name,
          fee: booking.bookingFee,
          deadline: booking.transferDeadline,
          bankAccount,
          quizLink,
        });
  return {
    text,
    link: buildWhatsAppLinkTo(booking.patient.whatsapp, text),
    deadline: booking.transferDeadline,
    missingBankAccount: bankAccount === null,
  };
}

/** Label batas di daftar "Menunggu konfirmasi" (spec C1 5.1). */
export function pendingDeadlineLabel(input: {
  kind: "EXPIRES" | "TRANSFER";
  deadline: Date;
  overdue: boolean;
}): string {
  if (input.overdue) return "Lewat batas transfer";
  const when = `${formatShortIndonesianDate(input.deadline)} ${minutesToTimeLabel(witaMinutesOfDay(input.deadline))}`;
  return input.kind === "EXPIRES" ? `Kedaluwarsa ${when}` : `Batas transfer ${when}`;
}
