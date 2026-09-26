import { prisma } from "@/lib/db";

const FORMAT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mengganti email login seorang staf. Dipanggil skrip admin
 * (`npm run change-email`), bukan dari halaman web — belum ada layar untuk ini.
 *
 * Better Auth menyimpan email dalam huruf kecil, jadi keduanya dinormalkan.
 * Semua sesi akun itu dihapus agar login berikutnya memakai email baru.
 */
export async function changeLoginEmail(
  currentEmail: string,
  newEmail: string,
): Promise<{ userId: string; email: string }> {
  const dari = currentEmail.trim().toLowerCase();
  const ke = newEmail.trim().toLowerCase();

  if (!FORMAT_EMAIL.test(ke)) {
    throw new Error(`Email baru tidak valid: ${newEmail}`);
  }

  const user = await prisma.user.findFirst({ where: { email: dari } });
  if (!user) {
    throw new Error(`Tidak ada akun dengan email ${currentEmail}.`);
  }

  if (ke !== dari) {
    const dipakai = await prisma.user.findFirst({ where: { email: ke } });
    if (dipakai) {
      throw new Error(`Email ${ke} sudah dipakai akun lain.`);
    }
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { email: ke } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);

  return { userId: user.id, email: ke };
}
