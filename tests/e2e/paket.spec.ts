import { expect, test, type Locator } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { aturHargaJual, isiHargaBeli } from "./helpers/harga";
import { isiTanggal, pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";
import { isiMeja } from "./helpers/stok-meja";
import { E2E_BASE_URL } from "./test-env";
import { dateLabel } from "../../src/lib/stock";
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
  await create.getByLabel("Harga paket").fill("400000");
  await create.getByLabel("Masa berlaku (hari)").fill("90");
  await pilihMemuat(create.getByLabel("Treatment 1"), "Relaxing Facial");
  await create.getByLabel("Jumlah sesi 1").fill("3");
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
  await expect(rp.getByRole("table", { name: "Sisa paket" })).toContainText("2 dari 3", { timeout: 30_000 });
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

test("paket berisi barang: jatah kapsul diambil di tagihan pembelian, stok meja berkurang, sisa tercatat", async ({ page, browser }, testInfo) => {
  const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
  const t = `${project === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  const itemName = `Kapsul Paket ${t}`;
  const packageName = `Paket Barang ${t}`;

  // Apoteker menyiapkan 50 kapsul di meja.
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok");
  await page.getByRole("button", { name: "+ Barang" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Tambah barang" });
  await itemDialog.getByLabel("Kode").fill(`E2E-PB-${t}`);
  await itemDialog.getByLabel("Nama", { exact: true }).fill(itemName);
  await itemDialog.getByLabel("Satuan").fill("kapsul");
  await itemDialog.getByLabel("Batas menipis").fill("2");
  await itemDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });
  await aturHargaJual(browser, itemName, "2000");
  await page.goto("/admin/stok/masuk/baru");
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplierDialog = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplierDialog.getByLabel("Nama supplier").fill(`Supplier Paket ${t}`);
  await supplierDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(supplierDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel("Supplier", { exact: true })).not.toHaveValue("");
  await page.getByLabel("Nomor faktur").fill(`PB-E2E-${t}`);
  await pilihOpsi(page, "Barang baris 1", `${itemName} (E2E-PB-${t})`);
  await page.getByLabel("Jumlah baris 1").fill("50");
  await page.getByLabel("Batch baris 1").fill("PB-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", addDaysToDateString(witaDateString(new Date()), 365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
  // Paket berisi barang butuh harga beli (spec paket informatif PI4).
  await isiHargaBeli(browser, page.url(), ["1500"]);
  await isiMeja(browser, itemName, "50");

  // Admin Keuangan membuat paket berisi treatment dan 30 kapsul.
  const finance = await browser.newContext({ baseURL: E2E_BASE_URL });
  const ak = await finance.newPage();
  await signIn(ak, E2E_KEUANGAN);
  await ak.goto("/admin/paket?tab=katalog");
  await tungguHidrasi(ak);
  await ak.getByRole("button", { name: "+ Paket" }).click();
  const create = ak.getByRole("dialog", { name: "Tambah paket" });
  await create.getByLabel("Nama paket").fill(packageName);
  await create.getByLabel("Harga paket").fill("900000");
  await pilihMemuat(create.getByLabel("Treatment 1"), "Relaxing Facial");
  await create.getByRole("button", { name: "+ Obat / produk" }).click();
  await pilihMemuat(create.getByLabel("Obat / produk 2", { exact: true }), itemName);
  await create.getByLabel("Jumlah 2", { exact: true }).fill("30");
  // Harga beli terakhir 1.500 × 30 kapsul (spec paket informatif PI1).
  await expect(create.getByRole("group", { name: "Isi paket 2" })).toContainText("Biaya Rp 45.000");
  await create.getByRole("button", { name: "Simpan" }).click();
  await expect(create).toBeHidden({ timeout: 30_000 });
  await expect(ak.getByRole("table", { name: "Katalog paket" })).toContainText(`1× Relaxing Facial, 30 kapsul ${itemName}`);
  await finance.close();

  // Resepsionis menjual paket dan langsung menyerahkan 10 kapsul di tagihan yang sama.
  const desk = await browser.newContext({ baseURL: E2E_BASE_URL });
  const rp = await desk.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: "+ Penjualan langsung" }).click();
  await rp.getByRole("dialog", { name: "Penjualan langsung" }).getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(rp, { name: `Pasien Paket Barang ${t}`, whatsapp: project === "mobile" ? "6281200097802" : "6281200097801" });
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await rp.getByRole("button", { name: "+ Paket" }).click();
  const sell = rp.getByRole("dialog", { name: "Jual paket" });
  await pilihMemuat(sell.getByLabel("Paket"), packageName);
  await sell.getByRole("button", { name: "Tambah" }).click();
  await expect(sell).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByRole("alert", { name: "Paket customer" })).toContainText(`dibeli di tagihan ini: 1 Relaxing Facial, 30 kapsul ${itemName}`, { timeout: 30_000 });
  await rp.getByRole("button", { name: "Ambil barang paket" }).click();
  const take = rp.getByRole("dialog", { name: "Ambil barang paket" });
  await pilihMemuat(take.getByLabel("Barang"), itemName);
  await take.getByLabel("Jumlah").fill("10");
  await take.getByRole("button", { name: "Ambil" }).click();
  await expect(take).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByText(`Dari paket ${packageName} yang dibeli di tagihan ini`)).toBeVisible({ timeout: 30_000 });
  await expect(rp.getByRole("region", { name: "Ringkasan tagihan" })).toContainText("Rp 900.000");
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });
  // Keterangan yang sama tampil di tabel tagihan dan di struk.
  await expect(rp.getByRole("table").getByText(`Jatah paket ${packageName} · sisa 20 dari 30 kapsul`)).toBeVisible();
  await expect(rp.getByLabel(/^Struk TG-/).getByText(`Jatah paket ${packageName} · sisa 20 dari 30 kapsul`)).toBeAttached();

  // Paket customer: sisa 20 dari 30 kapsul; stok meja 40.
  await rp.goto(`/admin/paket?cari=${encodeURIComponent(packageName)}`);
  await tungguHidrasi(rp);
  await rp.getByRole("link", { name: packageName }).click();
  await expect(rp.getByRole("table", { name: "Sisa paket" })).toContainText("20 dari 30 kapsul", { timeout: 30_000 });

  // Rencana kunjungan (spec jadwal paket JP7, JP9): kunjungan 1 selesai, kunjungan 2 seminggu lagi; resepsionis memajukannya ke besok.
  const today = witaDateString(new Date());
  const tomorrow = addDaysToDateString(today, 1);
  const plan = rp.getByRole("table", { name: "Rencana kunjungan" });
  await expect(plan.getByRole("row").filter({ hasText: "Ke-1" })).toContainText(`10 kapsul ${itemName}`);
  await expect(plan.getByRole("row").filter({ hasText: "Ke-1" })).toContainText("Selesai");
  await expect(plan.getByRole("row").filter({ hasText: "Ke-2" })).toContainText(dateLabel(addDaysToDateString(today, 7)));
  await expect(plan.getByRole("row").filter({ hasText: "Ke-2" })).toContainText(`Relaxing Facial, 20 kapsul ${itemName}`);
  await rp.getByRole("button", { name: "Ubah tanggal rencana" }).click();
  const change = rp.getByRole("dialog", { name: "Ubah tanggal rencana" });
  await isiTanggal(change, "Tanggal kunjungan berikutnya", tomorrow);
  await change.getByRole("button", { name: "Simpan" }).click();
  await expect(change).toBeHidden({ timeout: 30_000 });
  await expect(plan.getByRole("row").filter({ hasText: "Ke-2" })).toContainText(dateLabel(tomorrow), { timeout: 30_000 });

  // Pengingat H-1: pasien yang belum membooking muncul di kotak 4 (spec jadwal paket JP5).
  await rp.goto("/admin/pengingat");
  await tungguHidrasi(rp);
  const reminders = rp.getByRole("region", { name: /4 · Sesi paket perlu dibooking/ });
  const row = reminders.getByRole("listitem").filter({ hasText: `Pasien Paket Barang ${t}` });
  await expect(row).toContainText(`${packageName} · kunjungan ke-2`);
  await expect(row.getByRole("link", { name: "Ingatkan via WA" })).toHaveAttribute("href", /wa\.me/);
  await desk.close();
  await page.goto(`/admin/stok-meja?tampil=semua`);
  await tungguHidrasi(page);
  await expect(page.getByRole("table", { name: "Stok meja" }).getByRole("row").filter({ hasText: itemName })).toContainText("40 kapsul");
});
