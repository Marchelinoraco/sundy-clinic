import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";

// Tanpa "use server": pembantu server untuk konsultasi online, tidak dipanggil browser.

/**
 * Booking yang punya tempat di daftar per tanggal dan hitungan "hari ini" (spec 5.2):
 * semua booking klinik, dan booking online yang konsultasinya sudah dimulai. Booking
 * online yang belum dimulai belum punya jam yang berarti.
 */
export const DAY_LIST_CHANNEL: Prisma.AppointmentWhereInput = {
  OR: [{ channel: "KLINIK" }, { channel: "ONLINE", status: { in: ["HADIR", "SELESAI"] } }],
};

export const ONLINE_SERVICE_OFF = "Konsultasi Online belum diaktifkan. Atur harganya dan aktifkan di halaman Layanan.";

/** Layanan Konsultasi Online yang boleh dipesan: ada, aktif, dan berharga (spec 3.3). */
export async function loadOnlineService() {
  const service = await prisma.service.findUnique({
    where: { slug: ONLINE_SERVICE_SLUG },
    select: { id: true, name: true, promoPrice: true, durationMin: true, isActive: true },
  });
  if (!service || !service.isActive || service.promoPrice <= 0) return null;
  return { id: service.id, name: service.name, promoPrice: service.promoPrice, durationMin: service.durationMin };
}

/** Cabang administrasi booking online: cabang aktif pertama (spec 3.6). */
export async function onlineBranchId(): Promise<string | null> {
  const branch = await prisma.branch.findFirst({ where: { status: "AKTIF" }, orderBy: { sortOrder: "asc" }, select: { id: true } });
  return branch?.id ?? null;
}
