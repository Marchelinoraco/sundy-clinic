// Dijalankan oleh global-setup.ts dengan DATABASE_URL yang sudah diarahkan
// ke branch test. Jangan jalankan langsung tanpa lewat global-setup.
// dotenv tidak menimpa variabel yang sudah ada, jadi DATABASE_URL tetap
// menunjuk branch test; yang terisi dari .env hanya BETTER_AUTH_SECRET dkk.
import "dotenv/config";
import { auth } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db";
import { E2E_ADMIN } from "./credentials";

// Booking dan pasien dari putaran sebelumnya dibuang agar slot yang
// ditawarkan selalu sama di setiap putaran.
await prisma.slotHold.deleteMany();
await prisma.appointment.deleteMany();
await prisma.patient.deleteMany();
await prisma.patientNumberCounter.deleteMany();

const existing = await prisma.user.findFirst({ where: { email: E2E_ADMIN.email } });
if (!existing) {
  const created = await auth.api.signUpEmail({
    body: { email: E2E_ADMIN.email, password: E2E_ADMIN.password, name: E2E_ADMIN.name },
  });
  const staff = await prisma.staff.upsert({
    where: { slug: "staf-e2e" },
    update: { role: "SUPER_ADMIN", isActive: true },
    create: { slug: "staf-e2e", name: E2E_ADMIN.name, role: "SUPER_ADMIN" },
  });
  await prisma.user.update({ where: { id: created.user.id }, data: { staffId: staff.id } });
}

await prisma.$disconnect();
