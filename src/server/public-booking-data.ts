import { prisma } from "@/lib/db";
import { CONSULTATION_SERVICE_SLUG, SLIMMING_CATEGORY_SLUG } from "@/lib/booking-rules";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";
import { getClinicSetting } from "@/server/clinic-setting";
import { loadOnlineService } from "@/server/online-store";

export type PublicService = {
  id: string;
  name: string;
  price: number;
  durationMin: number;
  requiresDoctor: boolean;
};
export type PublicStaff = { id: string; name: string; role: "DOKTER" | "TERAPIS"; branchIds: string[] };
export type PublicBranch = { id: string; name: string; status: "AKTIF" | "SEGERA_HADIR" };
/** Pilihan "Online lewat WhatsApp" di layar Layanan & biaya (spec 4.1); null bila tidak tersedia. */
export type OnlineOption = { serviceId: string; serviceName: string; price: number; doctors: { id: string; name: string }[] };

export type BookingOptions = {
  branches: PublicBranch[];
  consultation: PublicService;
  /** Treatment untuk pasien Aesthetic lama (K9): aktif, di luar kategori slimming. */
  treatments: PublicService[];
  staff: PublicStaff[];
  bookingFee: number;
  online: OnlineOption | null;
};

const SERVICE_SELECT = {
  id: true,
  name: true,
  promoPrice: true,
  durationMin: true,
  requiresDoctor: true,
} as const;

function toPublicService(service: {
  id: string;
  name: string;
  promoPrice: number;
  durationMin: number;
  requiresDoctor: boolean;
}): PublicService {
  return {
    id: service.id,
    name: service.name,
    price: service.promoPrice,
    durationMin: service.durationMin,
    requiresDoctor: service.requiresDoctor,
  };
}

/**
 * Data halaman /daftar sebelum pasien memilih apa pun. Modul biasa yang
 * dipanggil server component — tidak terbuka sebagai server action. Tidak
 * memuat data pasien sama sekali.
 */
export async function getBookingOptions(): Promise<BookingOptions> {
  const [branches, consultation, treatments, staff, setting, onlineService] = await Promise.all([
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, status: true } }),
    prisma.service.findUniqueOrThrow({ where: { slug: CONSULTATION_SERVICE_SLUG }, select: SERVICE_SELECT }),
    prisma.service.findMany({
      where: {
        isActive: true,
        slug: { notIn: [CONSULTATION_SERVICE_SLUG, ONLINE_SERVICE_SLUG] },
        category: { slug: { not: SLIMMING_CATEGORY_SLUG } },
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: SERVICE_SELECT,
    }),
    prisma.staff.findMany({
      where: { isActive: true, role: { in: ["DOKTER", "TERAPIS"] } },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, role: true, scheduleTemplates: { select: { branchId: true } } },
    }),
    getClinicSetting(),
    loadOnlineService(),
  ]);

  const doctors = staff.filter((person) => person.role === "DOKTER").map((person) => ({ id: person.id, name: person.name }));
  const online: OnlineOption | null =
    onlineService && doctors.length > 0
      ? { serviceId: onlineService.id, serviceName: onlineService.name, price: onlineService.promoPrice, doctors }
      : null;

  return {
    branches,
    consultation: toPublicService(consultation),
    treatments: treatments.map(toPublicService),
    staff: staff.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role === "TERAPIS" ? "TERAPIS" : "DOKTER",
      branchIds: [...new Set(person.scheduleTemplates.map((t) => t.branchId))],
    })),
    bookingFee: setting.bookingFee,
    online,
  };
}
