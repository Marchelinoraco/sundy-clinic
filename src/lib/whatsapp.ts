import { CLINIC_NAME, CLINIC_WHATSAPP } from "./clinic";

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
