import "dotenv/config";
import { auth } from "../src/lib/auth";
import { prisma } from "../src/lib/db";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Pakai: npm run reset-password -- <email> "<kata-sandi-baru>"');
  process.exit(1);
}

// Aturan yang sama dengan form login — skrip ini tidak boleh jadi jalan pintas
// untuk memasang kata sandi yang ditolak aplikasi.
const minLength = auth.options.emailAndPassword?.minPasswordLength ?? 12;
if (password.length < minLength) {
  console.error(`Kata sandi minimal ${minLength} karakter.`);
  process.exit(1);
}

const user = await prisma.user.findFirst({ where: { email } });
if (!user) {
  console.error(`Tidak ada akun dengan email ${email}.`);
  process.exit(1);
}

const ctx = await auth.$context;
if (!(await ctx.internalAdapter.findCredentialAccount(user.id))) {
  console.error(`Akun ${email} tidak memakai login email & kata sandi.`);
  process.exit(1);
}

await ctx.internalAdapter.updatePassword(user.id, await ctx.password.hash(password));
// Siapa pun yang masih login dengan kata sandi lama harus keluar.
await ctx.internalAdapter.deleteUserSessions(user.id);

console.log(`Kata sandi ${email} sudah diganti. Semua sesi login lama dihapus.`);
await prisma.$disconnect();
