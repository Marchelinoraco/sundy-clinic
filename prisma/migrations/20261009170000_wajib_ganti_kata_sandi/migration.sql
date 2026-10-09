-- Wajib ganti kata sandi (spec kelola staf 3). Hanya menambah satu kolom bawaan false, sehingga rilis sebelumnya
-- tetap berjalan dan `deploy.sh kembali` aman. Akun yang sudah ada tidak terpengaruh.
ALTER TABLE "user" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
