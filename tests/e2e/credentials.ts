/** Akun Super Admin khusus uji. Hanya pernah dibuat di branch test (lihat prepare-db.mts). */
export const E2E_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "e2e@sundy.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? "kataSandiE2ePanjang123",
  name: "Staf E2E",
};
