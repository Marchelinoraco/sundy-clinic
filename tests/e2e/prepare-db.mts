// Dijalankan oleh global-setup.ts dengan DATABASE_URL yang sudah diarahkan
// ke basis data uji. Jangan jalankan langsung tanpa lewat global-setup.
// dotenv tidak menimpa variabel yang sudah ada, jadi DATABASE_URL tetap
// menunjuk basis data uji; yang terisi dari .env hanya BETTER_AUTH_SECRET dkk.
import "dotenv/config";
import { auth } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db";
import { combineWitaDateAndMinutes, witaDateString } from "../../src/lib/time";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { purgeEncounters } from "../purge-encounters";
import { slimmingNewPatient } from "../fixtures/quiz-answers-v2";

// Booking dan pasien dari putaran sebelumnya dibuang agar slot yang
// ditawarkan selalu sama di setiap putaran.
await purgeEncounters(prisma);
await prisma.slotHold.deleteMany();
await prisma.intake.deleteMany();
await prisma.appointment.deleteMany();
await prisma.patient.deleteMany();
await prisma.patientNumberCounter.deleteMany();

async function ensureAccount(
  account: { email: string; password: string; name: string },
  slug: string,
  role: "SUPER_ADMIN" | "RESEPSIONIS",
) {
  const existing = await prisma.user.findFirst({ where: { email: account.email } });
  if (existing) return;
  const created = await auth.api.signUpEmail({
    body: { email: account.email, password: account.password, name: account.name },
  });
  const staff = await prisma.staff.upsert({
    where: { slug },
    update: { role, isActive: true },
    create: { slug, name: account.name, role },
  });
  await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });
}

await ensureAccount(E2E_ADMIN, "staf-e2e", "SUPER_ADMIN");
await ensureAccount(E2E_RESEPSIONIS, "resepsionis-e2e", "RESEPSIONIS");

// Rekening uji: halaman sukses menampilkan instruksi transfer yang lengkap.
await prisma.clinicSetting.update({
  where: { id: 1 },
  data: { bookingFee: 100000, bankName: "BCA", bankAccountNumber: "1234567890", bankAccountHolder: "SunDY Clinic" },
});

// Kunjungan e2e (tests/e2e/kunjungan.spec.ts): satu pasien hadir HARI INI per
// proyek (desktop/mobile), dibuat langsung karena admin tidak bisa memesan jam
// yang sudah lewat. Jam 06.00/06.30 di luar jam buka agar tidak bentrok dengan
// slot yang dipesan uji lain.
const today = witaDateString(new Date());
const visitBranch = await prisma.branch.findUniqueOrThrow({ where: { slug: "mahakeret" } });
const visitDoctor = await prisma.staff.findUniqueOrThrow({ where: { slug: "diane-paparang" } });
const visitService = await prisma.service.findUniqueOrThrow({ where: { slug: "konsultasi-dokter" } });
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-KUNJ-${index + 1}`,
      name: `Pasien Kunjungan ${project}`,
      whatsapp: `6281200077${index}01`,
      birthDate: new Date("1990-05-17T00:00:00Z"),
      gender: "P",
      allergies: "Udang",
    },
  });
  const startAt = combineWitaDateAndMinutes(today, 6 * 60 + index * 30);
  await prisma.appointment.create({
    data: {
      code: `E2E-KUNJ-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: "WALK_IN",
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
}

// Persetujuan isian dari halaman kunjungan (kunjungan.spec.ts): pasien hadir hari ini
// dengan isian kuis v2 yang belum diperiksa, satu per proyek, pukul 07.00/07.30.
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-ISIAN-${index + 1}`,
      name: `Pasien Isian ${project}`,
      whatsapp: `6281200078${index}01`,
      birthDate: new Date("1992-04-17T00:00:00Z"),
      gender: "P",
      allergies: "Udang",
    },
  });
  const startAt = combineWitaDateAndMinutes(today, 7 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-ISIAN-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: "WALK_IN",
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
  await prisma.intake.create({
    data: {
      appointmentId: appointment.id,
      patientId: patient.id,
      status: "TERISI",
      kind: "LENGKAP",
      purpose: "SLIMMING",
      quizVersion: 2,
      answers: slimmingNewPatient,
      submittedAt: new Date(),
    },
  });
}

await prisma.$disconnect();
