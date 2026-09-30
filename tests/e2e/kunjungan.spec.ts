import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";

test.setTimeout(120_000);

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Kata Sandi").fill(account.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

/** Pasien hadir hari ini dari prepare-db.mts, satu per proyek agar desktop dan ponsel tidak berebut. */
const patientName = (testInfo: TestInfo) => `Pasien Kunjungan ${testInfo.project.name}`;

test("dokter memeriksa pasien hadir, memfinalisasi, lalu menambah adendum", async ({ page }, testInfo) => {
  await signIn(page, E2E_ADMIN);

  const today = page.getByRole("region", { name: "Pasien hari ini" });
  await today.getByRole("row").filter({ hasText: patientName(testInfo) }).getByRole("button", { name: "Periksa" }).click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Peringatan" })).toContainText("Udang");

  await page.getByLabel("Keluhan dan anamnesis dokter").fill("Berat naik 3 kg sejak Juli.");
  await page.getByLabel("Sistolik (mmHg)").fill("120");
  await page.getByLabel("Diastolik (mmHg)").fill("80");
  await page.getByLabel("Berat badan (kg)").fill("72,5");
  await page.getByLabel("Tinggi badan (cm)").fill("160");
  await expect(page.getByText("IMT 28,3")).toBeVisible();
  // Tanda simpan otomatis; bukan getByRole("status"), karena toast juga bisa berperan status.
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });

  // Draf bertahan setelah halaman dimuat ulang.
  await page.reload();
  await expect(page.getByLabel("Keluhan dan anamnesis dokter")).toHaveValue("Berat naik 3 kg sejak Juli.");
  await expect(page.getByLabel("Berat badan (kg)")).toHaveValue("72,5");

  await page.getByRole("button", { name: "Tambah treatment" }).click();
  await page.getByRole("group", { name: "Treatment 1" }).getByLabel("Area").fill("Perut");
  await page.getByLabel("Penilaian / diagnosis").fill("Obesitas derajat 1");
  await page.getByLabel("Rencana, program, dan resep").fill("Program MAX, kontrol 1 minggu.");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Finalisasi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Keluhan dan anamnesis dokter")).toHaveCount(0);
  await expect(page.getByText("Tekanan darah: 120/80 mmHg")).toBeVisible();

  await page.getByLabel("Isi adendum").fill("Tensi diukur ulang: 118/78.");
  await page.getByRole("button", { name: "Simpan adendum" }).click();
  await expect(page.getByText("Tensi diukur ulang: 118/78.")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Data pasien" }).click();
  await expect(page).toHaveURL(/\/admin\/pasien\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Riwayat kunjungan" })).toContainText("Obesitas derajat 1");
});

test("resepsionis tidak melihat daftar pasien hari ini dan tidak bisa membuka kunjungan", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await expect(page.getByRole("region", { name: "Pasien hari ini" })).toHaveCount(0);

  const response = await page.goto("/admin/kunjungan/sembarang");
  expect(response?.status()).toBe(403);
  await expect(page.getByLabel("Keluhan dan anamnesis dokter")).toHaveCount(0);
});
