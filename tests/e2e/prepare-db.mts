// Dijalankan oleh global-setup.ts dengan DATABASE_URL yang sudah diarahkan
// ke basis data uji. Jangan jalankan langsung tanpa lewat global-setup.
// dotenv tidak menimpa variabel yang sudah ada, jadi DATABASE_URL tetap
// menunjuk basis data uji; yang terisi dari .env hanya BETTER_AUTH_SECRET dkk.
import "dotenv/config";
import { auth } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db";
import { addDaysToDateString, combineWitaDateAndMinutes, witaDateString, witaWeekday } from "../../src/lib/time";
import { E2E_ADMIN, E2E_APOTEKER, E2E_APPROVAL_PIN, E2E_KEUANGAN, E2E_PERAWAT, E2E_RESEPSIONIS } from "./credentials";
import { purgeEncounters } from "../purge-encounters";
import { slimmingNewPatient } from "../fixtures/quiz-answers-v2";

// Booking dan pasien dari putaran sebelumnya dibuang agar slot yang
// ditawarkan selalu sama di setiap putaran.
await purgeEncounters(prisma);
// tampilan-admin.spec.ts membuka hari Minggu terapis lalu menutupnya lagi. Putaran yang gagal di tengah
// meninggalkannya terbuka, sehingga putaran berikutnya tidak bisa "membuka" lagi; kembalikan ke tutup.
await prisma.scheduleTemplate.deleteMany({ where: { weekday: 0, staff: { name: "Terapis SunDY Mahakeret" } } });
// Pengeluaran dan kategori buatan e2e (laporan.spec.ts) dibuang tiap putaran; kategori bawaan dari migrasi tetap.
await prisma.expense.deleteMany();
await prisma.recurringExpense.deleteMany();
await prisma.expenseCategory.deleteMany({ where: { name: { startsWith: "E2E" } } });
// Penggajian dan karyawan uji (spec karyawan): bulan penggajian unik global, jadi dikosongkan setiap putaran.
await prisma.invoiceLine.updateMany({ where: { payrollItemId: { not: null } }, data: { payrollItemId: null } });
await prisma.payrollItem.deleteMany();
await prisma.payrollPeriod.deleteMany();
await prisma.employee.deleteMany();
// Tagihan (tagihan.spec.ts) merujuk booking dan pasien, jadi dibuang lebih dulu.
// Paket treatment (paket.spec.ts): buku sesi dan paket customer lebih dulu, karena merujuk baris tagihan.
await prisma.packageSessionEntry.deleteMany();
await prisma.invoiceLine.updateMany({ where: { patientPackageItemId: { not: null } }, data: { patientPackageItemId: null } });
await prisma.patientPackage.deleteMany();
await prisma.invoicePayment.deleteMany();
await prisma.invoiceStockUse.deleteMany();
await prisma.invoiceLine.deleteMany();
await prisma.invoice.deleteMany();
await prisma.invoiceNumberCounter.deleteMany();
await prisma.treatmentPackage.deleteMany({ where: { name: { startsWith: "Paket E2E" } } });
// Paket berisi barang (paket.spec.ts) merujuk barang stok yang dibuang di bawah, jadi ikut dibuang.
await prisma.treatmentPackage.deleteMany({ where: { items: { some: { itemId: { not: null } } } } });
// Penyerahan obat (resep.spec.ts) merujuk booking dan baris tagihan, jadi dibuang sesudah tagihan dan sebelum booking.
await prisma.dispensingLine.deleteMany();
await prisma.dispensing.deleteMany();
await prisma.slotHold.deleteMany();
await prisma.intake.deleteMany();
await prisma.appointment.deleteMany();
await prisma.patient.deleteMany();
await prisma.patientNumberCounter.deleteMany();
// Stok dan hutang (stok-hutang.spec.ts) dimulai kosong setiap putaran; urutan anak ke induk.
await prisma.restockRequest.deleteMany();
await prisma.stockMovement.deleteMany();
await prisma.supplierReturnLine.deleteMany();
await prisma.supplierReturn.deleteMany();
await prisma.supplierPayment.deleteMany();
await prisma.stockBatch.deleteMany();
await prisma.purchaseLine.deleteMany();
await prisma.purchaseInvoice.deleteMany();
await prisma.supplier.deleteMany();
await prisma.stockItem.deleteMany();

async function ensureAccount(
  account: { email: string; password: string; name: string },
  slug: string,
  role: "SUPER_ADMIN" | "RESEPSIONIS" | "APOTEKER" | "ADMIN_KEUANGAN" | "TERAPIS",
) {
  const staff = await prisma.staff.upsert({
    where: { slug },
    update: { role, isActive: true },
    create: { slug, name: account.name, role },
  });
  // Uji integrasi memakai basis data yang sama dan sebagian menghapus semua staf: akun yang sudah ada
  // ditautkan ulang ke stafnya, kalau tidak panel menganggapnya belum masuk.
  const existing = await prisma.user.findFirst({ where: { email: account.email }, select: { id: true, staffId: true } });
  if (existing) {
    if (existing.staffId !== staff.id) await prisma.user.update({ where: { id: existing.id }, data: { staffId: staff.id } });
    return;
  }
  const created = await auth.api.signUpEmail({
    body: { email: account.email, password: account.password, name: account.name },
  });
  await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });
}

// Akun yang dibuat kelola-staf.spec.ts di putaran sebelumnya (email e2e-staf-…): dihapus agar tidak menumpuk.
const staleUsers = await prisma.user.findMany({ where: { email: { startsWith: "e2e-staf-" } }, select: { id: true, staffId: true } });
const staleIds = staleUsers.map((u) => u.id);
await prisma.session.deleteMany({ where: { userId: { in: staleIds } } });
await prisma.account.deleteMany({ where: { userId: { in: staleIds } } });
await prisma.user.deleteMany({ where: { id: { in: staleIds } } });
await prisma.staff.deleteMany({ where: { id: { in: staleUsers.flatMap((u) => (u.staffId ? [u.staffId] : [])) } } });

await ensureAccount(E2E_ADMIN, "staf-e2e", "SUPER_ADMIN");
await ensureAccount(E2E_RESEPSIONIS, "resepsionis-e2e", "RESEPSIONIS");
await ensureAccount(E2E_APOTEKER, "apoteker-e2e", "APOTEKER");
await ensureAccount(E2E_KEUANGAN, "keuangan-e2e", "ADMIN_KEUANGAN");
await ensureAccount(E2E_PERAWAT, "perawat-e2e", "TERAPIS");

// PIN persetujuan Admin Keuangan uji (spec PIN P7): diskon, ubah harga, dan pembatalan tagihan di e2e memintanya.
// Hitungan salah dan kunci dikosongkan setiap putaran.
const keuanganStaff = await prisma.staff.findUniqueOrThrow({ where: { slug: "keuangan-e2e" } });
const approvalPinHash = await (await auth.$context).password.hash(E2E_APPROVAL_PIN);
await prisma.approvalPin.upsert({
  where: { staffId: keuanganStaff.id },
  create: { staffId: keuanganStaff.id, pinHash: approvalPinHash },
  update: { pinHash: approvalPinHash, failedCount: 0, lockedUntil: null },
});

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
// durasi-konsultasi.spec.ts mengubah lama konsultasi lalu mengembalikannya; putaran yang gagal di tengah
// tidak boleh meninggalkan 15 menit untuk uji lain yang menghitung slot 30 menit.
await prisma.service.update({ where: { slug: "konsultasi-dokter" }, data: { durationMin: 30 } });
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

// Hasil BIA (hasil-bia.spec.ts): pasien hadir hari ini dengan catatan draf ber-id tetap, satu per proyek,
// pukul 00.00/00.30 (jam 01.00–07.30 sudah dipakai seed lain; di luar jam buka agar tidak bentrok dengan slot uji lain).
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-BIA-${index + 1}`, name: `Pasien BIA ${project}`, whatsapp: `6281200078${index}01`, gender: "P" },
  });
  const startAt = combineWitaDateAndMinutes(today, index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-BIA-${index + 1}`,
      type: "KONSULTASI",
      startAt,
      endAt: new Date(startAt.getTime() + 30 * 60_000),
      status: "HADIR",
      source: "WALK_IN",
      checkedInAt: startAt,
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: visitService.id,
      patientId: patient.id,
    },
  });
  await prisma.encounter.create({
    data: { id: `e2e-bia-${project}`, appointmentId: appointment.id, createdById: visitDoctor.id, createdByName: visitDoctor.name },
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

// Penyerahan obat (resep.spec.ts): satu pasien hadir hari ini per proyek, pukul 03.00/03.30
// (di luar jam buka, tidak bentrok dengan seed lain).
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-RESEP-${index + 1}`,
      name: `Pasien Resep ${project}`,
      whatsapp: `6281200081${index}01`,
      birthDate: new Date("1991-03-17T00:00:00Z"),
      gender: "P",
    },
  });
  const startAt = combineWitaDateAndMinutes(today, 3 * 60 + index * 30);
  await prisma.appointment.create({
    data: {
      code: `E2E-RESEP-${index + 1}`,
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

// Paket treatment (paket.spec.ts): per proyek satu pasien dengan dua kunjungan final hari ini berisi Relaxing Facial,
// pukul 21.00/21.30 (desktop) dan 22.00/22.30 (ponsel), di luar jam buka.
const relaxingFacial = await prisma.service.findUniqueOrThrow({ where: { slug: "relaxing-facial" } });
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-PAKET-${index + 1}`,
      name: `Pasien Paket ${project}`,
      whatsapp: `6281200091${index}01`,
      birthDate: new Date("1993-05-17T00:00:00Z"),
      gender: "P",
    },
  });
  for (const offset of [0, 1]) {
    const startAt = combineWitaDateAndMinutes(today, (21 + index) * 60 + offset * 30);
    const appointment = await prisma.appointment.create({
      data: {
        code: `E2E-PAKET-${index + 1}-${offset + 1}`,
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
    const encounter = await prisma.encounter.create({
      data: {
        appointmentId: appointment.id,
        createdById: visitDoctor.id,
        createdByName: visitDoctor.name,
        treatments: { create: [{ serviceId: relaxingFacial.id, serviceName: relaxingFacial.name, performerId: visitDoctor.id, performerName: visitDoctor.name, sortOrder: 0 }] },
      },
    });
    await prisma.encounter.update({
      where: { id: encounter.id },
      data: { status: "FINAL", assessment: "E2E paket", finalizedAt: new Date(), finalizedById: visitDoctor.id, finalizedByName: visitDoctor.name },
    });
  }
}

// Harga modal (harga-modal.spec.ts): biaya Relaxing Facial dimulai 0, dan per proyek satu pasien dengan kunjungan final
// berisi Relaxing Facial pukul 23.00 (desktop) / 23.30 (ponsel), pelaksana dokter seed.
await prisma.service.update({ where: { slug: "relaxing-facial" }, data: { materialCost: 0, toolCost: 0, commissionKind: null, commissionValue: 0 } });
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-MODAL-${index + 1}`, name: `Pasien Modal ${project}`, whatsapp: `6281200092${index}01`, birthDate: new Date("1994-06-17T00:00:00Z"), gender: "P" },
  });
  const startAt = combineWitaDateAndMinutes(today, 23 * 60 + index * 30);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-MODAL-${index + 1}`,
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
  const encounter = await prisma.encounter.create({
    data: {
      appointmentId: appointment.id,
      createdById: visitDoctor.id,
      createdByName: visitDoctor.name,
      treatments: { create: [{ serviceId: relaxingFacial.id, serviceName: relaxingFacial.name, performerId: visitDoctor.id, performerName: visitDoctor.name, sortOrder: 0 }] },
    },
  });
  await prisma.encounter.update({
    where: { id: encounter.id },
    data: { status: "FINAL", assessment: "E2E modal", finalizedAt: new Date(), finalizedById: visitDoctor.id, finalizedByName: visitDoctor.name },
  });
}

// Pemberitahuan langsung (pemberitahuan.spec.ts): dua pasien hadir hari ini per proyek (satu untuk resep, satu tanpa resep),
// pukul 01.00/01.30 (desktop) dan 02.00/02.30 (ponsel), di luar jam buka.
for (const [index, project] of ["desktop", "mobile"].entries()) {
  for (const [offset, label] of ["A", "B"].entries()) {
    const patient = await prisma.patient.create({
      data: {
        medicalRecordNumber: `SDY-E2E-NOTIF-${label}${index + 1}`,
        name: `Pasien Notif ${label} ${project}`,
        whatsapp: `6281200082${index}${offset}1`,
        birthDate: new Date("1993-02-11T00:00:00Z"),
        gender: "P",
      },
    });
    const startAt = combineWitaDateAndMinutes(today, (1 + index) * 60 + offset * 30);
    await prisma.appointment.create({
      data: {
        code: `E2E-NOTIF-${label}${index + 1}`,
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

// Konsultasi online (online-consultation.spec.ts): layanan diaktifkan berharga Rp 250.000, dan satu
// booking online terkonfirmasi per proyek yang semua rentang waktu luangnya sudah lewat (kemarin),
// sehingga muncul "Perlu waktu baru". Tanpa slot klinik, jadi jamnya tidak berebut dengan uji lain.
await prisma.service.update({
  where: { slug: "konsultasi-online" },
  data: { promoPrice: 250000, durationMin: 30, isActive: true },
});
const onlineService = await prisma.service.findUniqueOrThrow({ where: { slug: "konsultasi-online" } });
const yesterday = addDaysToDateString(today, -1);
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: {
      medicalRecordNumber: `SDY-E2E-ONLINE-${index + 1}`,
      name: `Pasien Online Lapsed ${project}`,
      whatsapp: `6281200081${index}01`,
    },
  });
  const from = combineWitaDateAndMinutes(yesterday, 10 * 60);
  const to = combineWitaDateAndMinutes(yesterday, 12 * 60);
  const appointment = await prisma.appointment.create({
    data: {
      code: `E2E-ONLINE-${index + 1}`,
      type: "KONSULTASI",
      channel: "ONLINE",
      startAt: from,
      endAt: to,
      status: "TERKONFIRMASI",
      source: "WHATSAPP",
      bookingFee: 100000,
      servicePrice: 250000,
      branchId: visitBranch.id,
      staffId: visitDoctor.id,
      serviceId: onlineService.id,
      patientId: patient.id,
    },
  });
  await prisma.contactWindow.create({ data: { appointmentId: appointment.id, startAt: from, endAt: to } });
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

// Perawat (perawat.spec.ts): booking terkonfirmasi HARI INI per proyek pukul 08.00/08.30, di luar jam buka,
// pasien dengan alergi dan data diri lengkap agar dialog check-in hanya meminta NIK (spec peran perawat 6–7).
for (const [index, project] of ["desktop", "mobile"].entries()) {
  const patient = await prisma.patient.create({
    data: { medicalRecordNumber: `SDY-E2E-PERAWAT-${index + 1}`, name: `Pasien Perawat ${project}`, whatsapp: `6281200083${index}01`, allergies: "Udang", ...identity },
  });
  const startAt = combineWitaDateAndMinutes(today, 8 * 60 + index * 30);
  await prisma.appointment.create({
    data: {
      code: `E2E-PERAWAT-${index + 1}`,
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
}

// Angka vital perawat (spec vital perawat VP4): dokter baru bisa menekan Periksa setelah perawat menekan Selesai ditangani.
// Kunjungan hari ini yang dibuka dokter di uji lain sudah selesai ditangani; E2E-PERAWAT dibiarkan untuk perawat.spec.ts.
// Pasien Kunjungan diukur 118/78 mmHg, 72,5 kg, 160 cm: kunjungan.spec.ts memeriksa salinannya di bagian O.
const nurse = await prisma.staff.findUniqueOrThrow({ where: { slug: "perawat-e2e" } });
const handledVisits = await prisma.appointment.findMany({
  where: { OR: ["E2E-KUNJ-", "E2E-ISIAN-", "E2E-RESEP-", "E2E-NOTIF-", "E2E-CEKIN-"].map((prefix) => ({ code: { startsWith: prefix } })) },
  select: { id: true, code: true },
});
for (const visit of handledVisits) {
  const measured = visit.code.startsWith("E2E-KUNJ-") ? { systolic: 118, diastolic: 78, weightKg: 72.5, heightCm: 160 } : {};
  await prisma.nurseVitals.create({
    data: { appointmentId: visit.id, ...measured, updatedById: nurse.id, updatedByName: nurse.name, completedAt: new Date(), completedById: nurse.id, completedByName: nurse.name },
  });
}

await prisma.$disconnect();
