import { expect, test, type Locator } from "@playwright/test";
import { E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { isiTanggal, tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";
import { addDaysToDateString, witaDateString } from "../../src/lib/time";

test.setTimeout(240_000);

/** Memilih opsi <select> menurut teks yang dikandungnya (label opsi memuat spasi rupiah). */
async function pilihMemuat(select: Locator, text: string) {
  await select.selectOption((await select.locator("option", { hasText: text }).first().getAttribute("value")) ?? "");
}

test("paket dijual dengan DP, sesinya dipakai di kunjungan berikutnya, lalu diperpanjang Admin Keuangan", async ({ page, browser }, testInfo) => {
  const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
  const t = `${project === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  const packageName = `Paket E2E ${t}`;
  const patientName = `Pasien Paket ${project}`;

  // Admin Keuangan membuat paket katalog.
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/paket?tab=katalog");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Paket" }).click();
  const create = page.getByRole("dialog", { name: "Tambah paket" });
  await create.getByLabel("Nama paket").fill(packageName);
  await create.getByLabel("Harga").fill("400000");
  await create.getByLabel("Masa berlaku (hari)").fill("90");
  await pilihMemuat(create.getByLabel("Treatment 1"), "Relaxing Facial");
  await create.getByLabel("Sesi 1").fill("3");
  await create.getByRole("button", { name: "Simpan" }).click();
  await expect(create).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Katalog paket" })).toContainText(packageName);

  // Resepsionis menjual paket di tagihan kunjungan pertama, lalu mencatat DP.
  const desk = await browser.newContext({ baseURL: E2E_BASE_URL });
  const rp = await desk.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: `Buat tagihan ${patientName}` }).first().click();
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await rp.getByRole("button", { name: "+ Paket" }).click();
  const sell = rp.getByRole("dialog", { name: "Jual paket" });
  await pilihMemuat(sell.getByLabel("Paket"), packageName);
  await expect(sell).toContainText("3× Relaxing Facial · berlaku 90 hari");
  await sell.getByRole("button", { name: "Tambah" }).click();
  await expect(sell).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByText("3× Relaxing Facial · berlaku 90 hari")).toBeVisible({ timeout: 30_000 });
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });
  await rp.getByRole("region", { name: "Pembayaran" }).getByRole("button", { name: "Catat pembayaran" }).click();
  const pay = rp.getByRole("dialog", { name: "Catat pembayaran" });
  await pay.getByLabel("Nominal").fill("100000");
  await pay.getByRole("button", { name: "Simpan" }).click();
  await expect(pay).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByText("Deposit", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Kunjungan kedua memakai sesi paket.
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: `Buat tagihan ${patientName}` }).first().click();
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await expect(rp.getByRole("alert", { name: "Paket customer" })).toContainText(packageName, { timeout: 30_000 });
  await rp.getByRole("button", { name: "Pakai sesi paket Relaxing Facial" }).click();
  await expect(rp.getByText(`Sesi paket ${packageName} · sisa 2 dari 3`)).toBeVisible({ timeout: 30_000 });
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  // Paket customer: sisa 2 dari 3, riwayat memuat pemakaian.
  await rp.goto(`/admin/paket?cari=${encodeURIComponent(packageName)}`);
  await tungguHidrasi(rp);
  await rp.getByRole("link", { name: packageName }).click();
  await expect(rp.getByRole("table", { name: "Sisa sesi" })).toContainText("2 dari 3", { timeout: 30_000 });
  await expect(rp.getByRole("table", { name: "Riwayat paket" })).toContainText("Pakai");
  await expect(rp.getByRole("button", { name: "Perpanjang" })).toHaveCount(0);
  const packageUrl = rp.url();
  await desk.close();

  // Admin Keuangan memperpanjang.
  await page.goto(packageUrl);
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "Perpanjang" }).click();
  const extend = page.getByRole("dialog", { name: "Perpanjang paket" });
  await isiTanggal(extend, "Berlaku sampai", addDaysToDateString(witaDateString(new Date()), 120));
  await extend.getByLabel("Alasan").fill("Customer sakit");
  await extend.getByRole("button", { name: "Simpan" }).click();
  await expect(extend).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Riwayat paket" })).toContainText("Perpanjang", { timeout: 30_000 });
});
