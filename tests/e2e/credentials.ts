/** Akun Super Admin khusus uji. Hanya pernah dibuat di basis data uji (lihat prepare-db.mts). */
export const E2E_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "e2e@sundy.test",
  password: process.env.E2E_ADMIN_PASSWORD ?? "kataSandiE2ePanjang123",
  name: "Staf E2E",
};

/** Akun resepsionis khusus uji — memastikan bagian klinis isian tidak terlihat olehnya. */
export const E2E_RESEPSIONIS = {
  email: process.env.E2E_RESEPSIONIS_EMAIL ?? "resepsionis-e2e@sundy.test",
  password: process.env.E2E_RESEPSIONIS_PASSWORD ?? "kataSandiResepsionisE2e123",
  name: "Resepsionis E2E",
};
