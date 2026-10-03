// Dijalankan oleh global-setup.ts dengan DATABASE_URL yang sudah diarahkan
// ke basis data uji. Jangan jalankan langsung tanpa lewat global-setup.
// dotenv tidak menimpa variabel yang sudah ada, jadi DATABASE_URL tetap
// menunjuk basis data uji; yang terisi dari .env hanya BETTER_AUTH_SECRET dkk.
import "dotenv/config";
import { auth } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString, witaWeekday } from "../../src/lib/time";
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

// Pengingat H-1 (pengingat.spec.ts): satu booking terkonfirmasi per proyek di hari buka
// berikutnya, pukul 06.00/06.30 (di luar jam buka). Hari pengingatnya hari ini (atau kemarin
// bila uji dijalankan hari Minggu). Konfirmasinya tercatat tiga hari lalu, jadi booking ini
// masuk "Ingatkan sekarang", bukan "Konfirmasi belum dikirim".
const holidayDates = new Set(
  (await prisma.holiday.findMany({ select: { date: true } })).map((h) => h.date.toISOString().slice(0, 10)),
);
let reminderDate = addDaysToDateString(today, 1);
while (witaWeekday(combineWitaDateAndMinutes(reminderDate, 12 * 60)) === 0 || holidayDates.has(reminderDate)) {
  reminderDate = addDaysToDateString(reminderDate, 1);
}
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-INGAT-${index + 1}`,
      name: `Pasien Pengingat ${project}`,
      whatsapp: `6281200079${index}01`,
    },
  });
  const startAt = combineWitaDateAndMinutes(reminderDate, 6 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-INGAT-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "TERKONFIRMASI",
      source: "WHATSAPP",
      bookingFee: 100000,
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
  await prisma.appointmentMessage.create({
    data: {
      appointmentId: appointment.id,
      kind: "KONFIRMASI",
      scheduledFor: startAt,
      sentById: "e2e",
      sentByName: "Admin E2E",
      sentAt: new Date(Date.now() - 3 * 24 * 60 * 60_000),
    },
  });
}

// Check-in (check-in.spec.ts): booking terkonfirmasi HARI INI per proyek, pukul 04.00/04.30
// dengan isian Slimming (food recall ditawarkan), dan 05.00/05.30 untuk pasien rangkap yang
// NIK-nya milik pasien lama. Di luar jam buka dan sebelum booking 06.00 uji lain.
const identity = {
  birthDate: new Date("1990-05-17T00:00:00Z"),
  gender: "P" as const,
  occupation: "Karyawan",
  address: "Jl. Sam Ratulangi, Manado",
};
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-CEKIN-${index + 1}`, name: `Rani Cekin ${project}`, whatsapp: `6281200080${index}01`, ...identity },
  });
  const startAt = combineWitaDateAndMinutes(today, 4 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-CEKIN-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "TERKONFIRMASI",
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

  await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-NIK-${index + 1}`,
      name: `Rina Lama ${project}`,
      whatsapp: `6281200081${index}01`,
      nik: `717101570590002${index + 1}`,
      ...identity,
    },
  });
  const duplicate = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-RANGKAP-${index + 1}`, name: `Rina Baru ${project}`, whatsapp: `6281200082${index}01`, ...identity },
  });
  const mergeAt = combineWitaDateAndMinutes(today, 5 * 60 + index * 30);
  await prisma.appointment.create({
    data: {
      code: `E2E-GABUNG-${index + 1}`,
      type: "KONSULTASI",
      startAt: mergeAt,
      endAt: new Date(mergeAt.getTime() + 30 * 60_000),
      status: "TERKONFIRMASI",
      source: "WALK_IN",
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: duplicate.id,
    },
  });
}

await prisma.$disconnect();
