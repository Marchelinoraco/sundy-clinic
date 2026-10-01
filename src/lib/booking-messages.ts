import { CLINIC_NAME } from "./clinic";
import { formatScheduleForMessage } from "./format";
import { bookingServiceName } from "./transfer-instruction";
import { buildWhatsAppLinkTo } from "./whatsapp";

/** Jenis pesan WhatsApp yang dicatat terkirim (spec C2 bagian 6). */
export const MESSAGE_KINDS = ["INSTRUKSI_TRANSFER", "KONFIRMASI", "PENGINGAT"] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

/** Balasan pasien atas pengingat H-1 (keputusan P5). */
export const REMINDER_REPLIES = ["AKAN_DATANG", "MINTA_PINDAH", "TIDAK_MEMBALAS"] as const;
export type ReminderReplyValue = (typeof REMINDER_REPLIES)[number];

export const REMINDER_REPLY_LABEL: Record<ReminderReplyValue, string> = {
  AKAN_DATANG: "Akan datang",
  MINTA_PINDAH: "Minta pindah",
  TIDAK_MEMBALAS: "Tidak membalas",
};

/** Pesan siap kirim; `link` null bila nomor WhatsApp pasien tidak sah. */
export type WhatsAppMessage = { text: string; link: string | null };

/**
 * Pesan lanjutan setelah Verifikasi atau Pindah jadwal (spec C2 3.1, bagian 5).
 * `scheduledFor` adalah jadwal yang tertulis di teks; pencatatan kirim menolak
 * bila jadwal booking sudah berubah sejak itu.
 */
export type BookingMessage = WhatsAppMessage & { kind: "KONFIRMASI" | "INSTRUKSI_TRANSFER"; scheduledFor: Date };

const ARRIVE_EARLY = "Mohon datang 10 menit sebelum jadwal.";

/** Teks konfirmasi setelah transfer diverifikasi (spec C2 3.2). */
export function confirmationText(input: {
  patientName: string;
  code: string;
  serviceName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  branchAddress: string;
  mapsUrl: string | null;
  /** null untuk walk-in atau booking tanpa biaya: kalimat tentang biaya dihilangkan. */
  bookingFee: number | null;
  /** Alamat situs tanpa garis miring di akhir, misal "https://sundyclinic.com". */
  siteUrl: string;
}): string {
  const lines = [
    `Halo ${input.patientName}, booking Anda di ${CLINIC_NAME} sudah terkonfirmasi.`,
    "",
    `Kode booking: ${input.code}`,
    `Layanan: ${input.serviceName}`,
    `Jadwal: ${formatScheduleForMessage(input.startAt)}`,
    `Tenaga: ${input.staffName} · ${input.branchName}`,
    `Alamat: ${input.branchAddress}`,
  ];
  if (input.mapsUrl) lines.push(`Peta: ${input.mapsUrl}`);
  lines.push(
    "",
    ARRIVE_EARLY,
    input.bookingFee === null
      ? "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya."
      : "Ingin pindah jadwal? Kabari kami di chat ini paling lambat 2 jam sebelumnya; biaya booking tetap berlaku. Bila dibatalkan, biaya booking tidak dikembalikan.",
    `Cek status booking: ${input.siteUrl}/cek-booking?kode=${encodeURIComponent(input.code)}`,
    "",
    "Sampai jumpa di klinik.",
  );
  return lines.join("\n");
}

/** Teks pengingat H-1 (spec C2 4.4). Tanggal selalu lengkap: pengingat Sabtu bisa untuk jadwal Senin. */
export function reminderText(input: {
  patientName: string;
  serviceName: string;
  startAt: Date;
  staffName: string;
  branchName: string;
  branchAddress: string;
  mapsUrl: string | null;
}): string {
  const lines = [
    `Halo ${input.patientName}, kami mengingatkan jadwal Anda di ${CLINIC_NAME}:`,
    formatScheduleForMessage(input.startAt),
    `${input.serviceName} dengan ${input.staffName}`,
    `${input.branchName} — ${input.branchAddress}`,
  ];
  if (input.mapsUrl) lines.push(`Peta: ${input.mapsUrl}`);
  lines.push(
    "",
    `${ARRIVE_EARLY} Balas YA bila Anda akan datang, atau kabari kami bila ingin pindah jadwal.`,
  );
  return lines.join("\n");
}

/** Bagian booking yang dibutuhkan untuk menyusun konfirmasi dan pengingat. */
export type MessageBooking = {
  code: string;
  type: "KONSULTASI" | "TREATMENT";
  startAt: Date;
  bookingFee: number | null;
  service: { name: string } | null;
  staff: { name: string };
  branch: { name: string; address: string; mapsUrl: string | null };
  patient: { name: string; whatsapp: string } | null;
};

/** null untuk booking situs yang belum dicocokkan (belum ada pasien). */
export function confirmationMessageFor(booking: MessageBooking, siteUrl: string): WhatsAppMessage | null {
  if (!booking.patient) return null;
  const text = confirmationText({
    patientName: booking.patient.name,
    code: booking.code,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    branchAddress: booking.branch.address,
    mapsUrl: booking.branch.mapsUrl,
    bookingFee: booking.bookingFee,
    siteUrl,
  });
  return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
}

export function reminderMessageFor(booking: MessageBooking): WhatsAppMessage | null {
  if (!booking.patient) return null;
  const text = reminderText({
    patientName: booking.patient.name,
    serviceName: bookingServiceName(booking),
    startAt: booking.startAt,
    staffName: booking.staff.name,
    branchName: booking.branch.name,
    branchAddress: booking.branch.address,
    mapsUrl: booking.branch.mapsUrl,
  });
  return { text, link: buildWhatsAppLinkTo(booking.patient.whatsapp, text) };
}
