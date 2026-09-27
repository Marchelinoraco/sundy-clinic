import "dotenv/config";
import { prisma } from "../src/lib/db";
import { changeLoginEmail } from "../src/server/account";

const [lama, baru] = process.argv.slice(2);

if (!lama || !baru) {
  console.error("Pakai: npm run change-email -- <email-lama> <email-baru>");
  process.exit(1);
}

try {
  const { email } = await changeLoginEmail(lama, baru);
  console.log(`Email login ${lama} sudah diganti menjadi ${email}. Semua sesi login lama dihapus.`);
} catch (galat) {
  console.error(galat instanceof Error ? galat.message : galat);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
