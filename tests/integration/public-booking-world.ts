import { prisma } from "@/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString } from "@/lib/time";
import { purgeEncounters } from "../purge-encounters";

export type BookingWorld = {
  branchId: string;
  doctorId: string;
  therapistId: string;
  consultationId: string;
  treatmentId: string;
  slimmingTreatmentId: string;
};

/**
 * Cabang, dokter, dan terapis uji yang bekerja setiap hari 11.00–19.00,
 * sehingga uji tidak bergantung pada hari dalam minggu. Layanan
 * `konsultasi-dokter` dan kategori `slimming` di-upsert, karena keduanya
 * juga milik seed; sisanya memakai slug uji.
 */
export async function createBookingWorld(slug: string): Promise<BookingWorld> {
  const branch = await prisma.branch.create({
    data: {
      slug,
      name: "Cabang Publik Uji",
      address: "Alamat",
      whatsapp: "6285172228900",
      openingHours: "Setiap hari, 11.00–19.00",
      status: "AKTIF",
    },
  });
  const doctor = await prisma.staff.create({
    data: { slug: `${slug}-dokter`, name: "dr. Uji Publik", role: "DOKTER", sortOrder: 1 },
  });
  const therapist = await prisma.staff.create({
    data: { slug: `${slug}-terapis`, name: "Terapis Uji Publik", role: "TERAPIS", sortOrder: 2 },
  });
  for (const staffId of [doctor.id, therapist.id]) {
    await prisma.scheduleTemplate.createMany({
      data: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        staffId,
        branchId: branch.id,
        weekday,
        startMinute: 660,
        endMinute: 1140,
      })),
    });
  }

  const slimming = await prisma.serviceCategory.upsert({
    where: { slug: "slimming" },
    update: {},
    create: { slug: "slimming", name: "Slimming & Wellness" },
  });
  const consultation = await prisma.service.upsert({
    where: { slug: "konsultasi-dokter" },
    update: { isActive: true, requiresDoctor: true, durationMin: 30 },
    create: {
      slug: "konsultasi-dokter",
      name: "Konsultasi Dokter",
      promoPrice: 200000,
      durationMin: 30,
      requiresDoctor: true,
      categoryId: slimming.id,
    },
  });
  const aesthetic = await prisma.serviceCategory.create({
    data: { slug: `${slug}-aesthetic`, name: "Aesthetic Uji" },
  });
  const treatment = await prisma.service.create({
    data: {
      slug: `${slug}-facial`,
      name: "Facial Uji",
      promoPrice: 250000,
      durationMin: 60,
      requiresDoctor: false,
      categoryId: aesthetic.id,
    },
  });
  const slimmingTreatment = await prisma.service.create({
    data: {
      slug: `${slug}-meso`,
      name: "Meso Uji",
      promoPrice: 550000,
      durationMin: 30,
      requiresDoctor: true,
      categoryId: slimming.id,
    },
  });

  return {
    branchId: branch.id,
    doctorId: doctor.id,
    therapistId: therapist.id,
    consultationId: consultation.id,
    treatmentId: treatment.id,
    slimmingTreatmentId: slimmingTreatment.id,
  };
}

export async function cleanupBookingWorld(slug: string, patientWhatsapps: string[] = []) {
  // Kunjungan menahan booking (FK Restrict) dan kunjungan final tidak bisa dihapus
  // biasa. Berkas uji berjalan berurutan (fileParallelism: false), jadi aman
  // mengosongkan semuanya.
  await purgeEncounters(prisma);
  const staff = { staff: { slug: { startsWith: slug } } };
  await prisma.intake.deleteMany({ where: { appointment: staff } });
  await prisma.appointment.deleteMany({ where: staff });
  await prisma.slotHold.deleteMany({ where: staff });
  await prisma.patient.deleteMany({ where: { whatsapp: { in: patientWhatsapps } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.serviceCategory.deleteMany({ where: { slug: `${slug}-aesthetic` } });
  await prisma.staff.deleteMany({ where: { slug: { startsWith: slug } } });
  await prisma.branch.deleteMany({ where: { slug } });
}

/** Tanggal WITA paling cepat `offsetDays` hari lagi yang bukan hari libur di basis data uji. */
export async function bookableDate(offsetDays = 2): Promise<string> {
  let date = addDaysToDateString(witaDateString(new Date()), offsetDays);
  while (await prisma.holiday.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } })) {
    date = addDaysToDateString(date, 1);
  }
  return date;
}

/** Instant UTC untuk jam WITA "HH:MM" pada tanggal itu. */
export function at(date: string, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  return combineWitaDateAndMinutes(date, hours * 60 + minutes);
}
