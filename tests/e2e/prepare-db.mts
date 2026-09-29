// Dijalankan oleh global-setup.ts dengan DATABASE_URL yang sudah diarahkan
// ke basis data uji. Jangan jalankan langsung tanpa lewat global-setup.
// dotenv tidak menimpa variabel yang sudah ada, jadi DATABASE_URL tetap
// menunjuk basis data uji; yang terisi dari .env hanya BETTER_AUTH_SECRET dkk.
import "dotenv/config";
import { auth } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";

// Booking dan pasien dari putaran sebelumnya dibuang agar slot yang
// ditawarkan selalu sama di setiap putaran.
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

await prisma.$disconnect();
