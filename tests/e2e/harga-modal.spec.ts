import { expect, test } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

test.setTimeout(240_000);

test("Admin Keuangan mengisi biaya treatment; resepsionis menagih dengan pelaksana tanpa melihat angka; margin dan komisi tampil bagi keuangan", async ({ page, browser }, testInfo) => {
  const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
  const patientName = `Pasien Modal ${project}`;

  // Apoteker: tanpa harga beli dan nilai stok.
  const pharmacy = await browser.newContext({ baseURL: E2E_BASE_URL });
  const ap = await pharmacy.newPage();
  await signIn(ap, E2E_APOTEKER);
  await ap.goto("/admin/stok");
  await tungguHidrasi(ap);
  await expect(ap.getByText("Nilai stok (harga beli)")).toHaveCount(0);
  await ap.goto("/admin/stok/masuk/baru");
  await tungguHidrasi(ap);
  await expect(ap.getByLabel("Harga beli baris 1")).toHaveCount(0);
  await pharmacy.close();

  // Admin Keuangan: biaya Relaxing Facial.
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/layanan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "Harga & biaya Relaxing Facial" }).click();
  const cost = page.getByRole("dialog", { name: "Harga & biaya Relaxing Facial" });
  // Total biaya di atas harga berlaku: Simpan tidak bisa ditekan (spec biaya lainnya BL4).
  await cost.getByLabel("Biaya bahan").fill("200000");
  await expect(cost.getByRole("alert")).toContainText("melebihi harga berlaku");
  await expect(cost.getByRole("button", { name: "Simpan" })).toBeDisabled();
  await cost.getByLabel("Biaya bahan").fill("30000");
  await cost.getByLabel("Biaya alat").fill("5000");
  await cost.getByLabel("Komisi", { exact: true }).selectOption("NOMINAL");
  await cost.getByLabel("Komisi per sesi").fill("15000");
  await cost.getByRole("button", { name: "+ Biaya lainnya" }).click();
  await cost.getByLabel("Nama biaya lainnya 1").fill("Laundry handuk");
  await cost.getByLabel("Nominal biaya lainnya 1").fill("5000");
  await expect(cost).toContainText("Total biaya per sesi Rp 55.000");
  await cost.getByRole("button", { name: "Simpan" }).click();
  await expect(cost).toBeHidden({ timeout: 30_000 });

  // Resepsionis: pelaksana terisi dari kunjungan, tanpa angka biaya atau komisi.
  const desk = await browser.newContext({ baseURL: E2E_BASE_URL });
  const rp = await desk.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: `Buat tagihan ${patientName}` }).click();
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await expect(rp.getByLabel("Pelaksana Relaxing Facial")).not.toHaveValue("", { timeout: 30_000 });
  await expect(rp.getByText("Rp 15.000")).toHaveCount(0);
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });
  await expect(rp.getByRole("region", { name: "Margin" })).toHaveCount(0);
  const invoiceUrl = rp.url();
  await desk.close();

  // Admin Keuangan: margin tagihan dan tab Komisi.
  await page.goto(invoiceUrl);
  await tungguHidrasi(page);
  const margin = page.getByRole("region", { name: "Margin" });
  await expect(margin).toContainText("Bahan, alat, dan lainnyaRp 40.000", { timeout: 30_000 });
  await expect(margin).toContainText("KomisiRp 15.000");
  await page.goto("/admin/laporan?tab=komisi");
  await tungguHidrasi(page);
  await expect(page.getByRole("table", { name: "Komisi per pelaksana" })).toContainText("Rp 15.000", { timeout: 30_000 });
  await page.goto("/admin/laporan?tab=margin");
  await tungguHidrasi(page);
  await expect(page.getByRole("table", { name: "Margin per treatment" })).toContainText("Relaxing Facial");
});
