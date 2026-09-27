import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";

// Sidebar hanya bisa diciutkan menjadi kolom ikon di layar lebar; di ponsel ia
// menjadi laci (sheet) yang selalu lebar penuh.
test.skip(({ isMobile }) => isMobile, "sidebar ikon hanya ada di layar lebar");

test("judul klinik tetap rapi saat sidebar admin diciutkan", async ({ page }) => {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Kata Sandi").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });

  const sidebar = page.locator('[data-slot="sidebar"][data-state]');
  const kolom = page.locator('[data-slot="sidebar-container"]');
  const judul = page.locator('[data-slot="sidebar-header"] a').first();

  await expect(judul).toContainText("SunDY Clinic");

  await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  // Lebar sidebar berubah lewat animasi; tunggu sampai menjadi kolom ikon.
  await expect.poll(async () => (await kolom.boundingBox())?.width ?? 999).toBeLessThan(80);

  const kotakJudul = await judul.boundingBox();
  const kotakKolom = await kolom.boundingBox();
  if (!kotakJudul || !kotakKolom) throw new Error("judul atau kolom sidebar tidak terukur");

  // Judul harus muat di kolom ikon: tidak meluber ke kanan, tidak terlipat
  // menjadi beberapa baris, dan isinya tidak terpotong di dalam tautan.
  expect(kotakJudul.x + kotakJudul.width).toBeLessThanOrEqual(kotakKolom.x + kotakKolom.width);
  expect(kotakJudul.height).toBeLessThanOrEqual(48);
  expect(await judul.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
});
