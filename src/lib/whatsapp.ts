import { CLINIC_NAME, CLINIC_WHATSAPP } from "./clinic";
import { formatRupiah } from "./format";

/**
 * Menyeragamkan nomor WhatsApp Indonesia ke bentuk "62xxxxxxxxxx", atau null
 * bila tidak sah. Admin mengetik "0812…", "+62 812…", atau "812…" untuk nomor
 * yang sama — tanpa penyeragaman, deteksi pasien duplikat meleset.
 */
export function normalizeWhatsapp(input: string): string | null {
  if (/[^\d\s()+-]/.test(input)) return null;

  let digits = input.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;

  return /^62\d{8,13}$/.test(digits) ? digits : null;
}

/** Membangun tautan wa.me ke nomor klinik dengan pesan yang sudah terisi. */
export function buildWhatsAppLink(message: string): string {
  return `https://wa.me/${CLINIC_WHATSAPP}?text=${encodeURIComponent(message)}`;
}

/** Tautan wa.me ke nomor pasien, atau null bila nomornya tidak sah. */
export function buildWhatsAppLinkTo(phone: string, message: string): string | null {
  const normalized = normalizeWhatsapp(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

/** Pesan pembuka untuk pertanyaan umum (tombol WhatsApp melayang, menu ponsel, ajakan akhir). */
export function generalInquiryMessage(): string {
  return `Halo ${CLINIC_NAME}, saya ingin bertanya.`;
}

export function productInquiryMessage(productName: string): string {
  return `Halo ${CLINIC_NAME}, saya ingin memesan produk ${productName}. Mohon informasinya.`;
}

export function serviceInquiryMessage(serviceName: string): string {
  return `Halo ${CLINIC_NAME}, saya ingin bertanya tentang treatment ${serviceName}.`;
}

export function branchNotifyMessage(branchName: string): string {
  return `Halo ${CLINIC_NAME}, mohon beri tahu saya saat cabang ${branchName} sudah buka.`;
}

export function appointmentConfirmationMessage(input: {
  patientName: string;
  code: string;
  staffName: string;
  branchName: string;
  dateLabel: string;
  timeLabel: string;
}): string {
  return (
    `Halo ${CLINIC_NAME}, saya sudah booking konsultasi. Kode: ${input.code}, ` +
    `atas nama ${input.patientName}, dengan ${input.staffName} di cabang ${input.branchName}, ` +
    `${input.dateLabel} pukul ${input.timeLabel}. Berikut bukti transfernya.`
  );
}

/** "6281234567890" → "0812-****-7890". Halaman publik tidak pernah menampilkan nomor utuh (PRD bagian 10). */
export function maskWhatsapp(normalized: string): string {
  const local = normalized.startsWith("62") ? `0${normalized.slice(2)}` : normalized;
  return `${local.slice(0, 4)}-****-${local.slice(-4)}`;
}

/** Pesan pasien ke klinik setelah booking di situs, untuk mengantar bukti transfer (spec 3.1). */
export function siteBookingWhatsAppMessage(input: {
  patientName: string;
  code: string;
  serviceName: string;
  staffName: string;
  branchName: string;
  dateLabel: string;
  timeLabel: string;
  bookingFee: number | null;
}): string {
  const transfer = input.bookingFee
    ? ` Berikut bukti transfer biaya booking ${formatRupiah(input.bookingFee)}.`
    : "";
  return (
    `Halo ${CLINIC_NAME}, saya sudah booking ${input.serviceName}. Kode: ${input.code}, ` +
    `atas nama ${input.patientName}, dengan ${input.staffName} di ${input.branchName}, ` +
    `${input.dateLabel} pukul ${input.timeLabel}.${transfer}`
  );
}

/** Permintaan pindah jadwal dari /cek-booking; admin memindahkannya di panel (spec 3.3). */
export function rescheduleRequestMessage(input: { code: string; dateLabel: string; timeLabel: string }): string {
  return `Halo ${CLINIC_NAME}, saya ingin pindah jadwal booking ${input.code} (${input.dateLabel} pukul ${input.timeLabel}).`;
}

/** Pesan customer ke klinik setelah mendaftar konsultasi online di situs, untuk mengantar bukti transfer. */
export function onlineSiteBookingWhatsAppMessage(input: {
  patientName: string;
  code: string;
  staffName: string;
  total: number;
}): string {
  return (
    `Halo ${CLINIC_NAME}, saya sudah mendaftar konsultasi online. Kode: ${input.code}, ` +
    `atas nama ${input.patientName}, dengan ${input.staffName}. Berikut bukti transfer ${formatRupiah(input.total)}.`
  );
}

/** Dari /cek-booking: customer meminta ganti waktu atau batal konsultasi online lewat WA (spec 4.5). */
export function onlineChangeRequestMessage(code: string): string {
  return `Halo ${CLINIC_NAME}, saya ingin mengganti waktu atau membatalkan konsultasi online ${code}.`;
}
