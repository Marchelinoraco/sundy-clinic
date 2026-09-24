import { CLINIC_NAME, CLINIC_WHATSAPP } from "./clinic";

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
