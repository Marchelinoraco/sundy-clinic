import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    // `disableSignUp` sengaja TIDAK dipakai: itu juga memblokir auth.api.signUpEmail()
    // dari kode server sendiri, termasuk skrip bootstrap akun Super Admin pertama
    // (scripts/create-admin.ts) — masalah ayam-dan-telur karena skrip itu berjalan
    // sebelum ada admin mana pun untuk membuat akun berikutnya.
    //
    // Tidak ada halaman "/daftar" di situs ini, jadi endpoint sign-up Better
    // Auth hanya dipanggil dari kode server tepercaya (skrip ini dan aksi
    // staff:manage). Siapa pun yang memanggil endpoint mentahnya secara
    // langsung tetap mendapat sesi Better Auth yang sah, tetapi tidak
    // membuka apa pun: getCurrentStaff() di server/session.ts mengembalikan
    // null untuk user tanpa baris Staff aktif yang tertaut, dan seluruh
    // halaman /admin memanggil itu lebih dulu.
  },

  session: {
    expiresIn: 60 * 60 * 8, // 8 jam — sekitar satu sif kerja
    updateAge: 60 * 60, // perpanjang paling sering satu jam sekali
  },

  user: {
    additionalFields: {
      staffId: { type: "string", required: false, input: false },
    },
  },
});
