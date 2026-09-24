import { expect, test } from "@playwright/test";

test("panel admin menolak pengunjung yang belum login", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/masuk$/);
});

test("halaman staf juga tertutup untuk yang belum login", async ({ page }) => {
  // Diuji terpisah dari /admin: melindungi halaman induk saja tidak cukup
  // bila URL anak bisa diketik langsung.
  await page.goto("/admin/staf");
  await expect(page).toHaveURL(/\/masuk$/);
});

test("halaman jadwal, pasien, dan booking tertutup untuk yang belum login", async ({ page }) => {
  for (const path of ["/admin/jadwal", "/admin/pasien", "/admin/booking", "/admin/booking/baru"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/masuk$/);
  }
});

test("halaman login tidak meminta mesin pencari mengindeksnya", async ({ page }) => {
  await page.goto("/masuk");
  const robots = page.locator('meta[name="robots"]');
  await expect(robots).toHaveAttribute("content", /noindex/);
});

test("kredensial salah ditolak tanpa menyebut kolom mana yang keliru", async ({ page }) => {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill("bukan-siapa-siapa@sundy.test");
  await page.getByLabel("Kata Sandi").fill("kataSandiSalah123");
  await page.getByRole("button", { name: "Masuk" }).click();

  // Dipersempit ke <form>: Next menyuntikkan role="alert" tersembunyi milik
  // route announcer di luar form, membuat pencocokan role mentah ambigu.
  await expect(page.locator("form").getByRole("alert")).toHaveText(
    /email atau kata sandi salah/i,
  );
  await expect(page).toHaveURL(/\/masuk$/);
});

test("situs publik tetap dapat diakses tanpa login", async ({ page }) => {
  await page.goto("/layanan");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Layanan");
});
