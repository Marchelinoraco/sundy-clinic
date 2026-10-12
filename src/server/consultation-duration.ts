import { CONSULTATION_SERVICE_SLUG, DEFAULT_CONSULTATION_MINUTES } from "@/lib/booking-rules";
import { prisma } from "@/lib/db";

/**
 * Lama konsultasi klinik, diatur di Layanan & Harga pada layanan Konsultasi Dokter. Modul biasa
 * (bukan "use server"): dipakai halaman Booking Baru, isian awal booking, dasbor, dan pemeriksaan
 * saat booking disimpan, supaya semuanya memakai satu angka yang sama.
 */
export async function getConsultationMinutes(): Promise<number> {
  const service = await prisma.service.findUnique({
    where: { slug: CONSULTATION_SERVICE_SLUG },
    select: { durationMin: true },
  });
  return service?.durationMin ?? DEFAULT_CONSULTATION_MINUTES;
}
