import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { purgeEncounters } from "../purge-encounters";

// Uji e2e (tests/e2e/prepare-db.mts) memakai basis data uji yang sama dan
// meninggalkan booking, isian, kunjungan, dan hold. Beberapa berkas di sini menghapus
// semua staf atau cabang, yang ditolak foreign key selama sisa itu ada —
// hasilnya lalu bergantung pada urutan berkas. Rangkaian uji dimulai bersih.
export default async function setup() {
  // TEST_DATABASE_URL sudah diwajibkan oleh vitest.integration.config.mts.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.TEST_DATABASE_URL! }),
  });
  try {
    await purgeEncounters(prisma);
    await prisma.slotHold.deleteMany();
    await prisma.intake.deleteMany();
    await prisma.appointment.deleteMany();
  } finally {
    await prisma.$disconnect();
  }
}
