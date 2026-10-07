import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";

// Satu cerita berurutan per proyek (desktop/ponsel, data masing-masing):
// Apoteker menyiapkan stok → Resepsionis menagih penjualan langsung (barang, baris layanan, diskon),
// memfinalkan, dan menerima pembayaran sebagian lalu lunas → Admin Keuangan membatalkan pembayaran
// dan tagihan → Apoteker tidak bisa membuka tagihan.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");

/** Tanggal WITA ("YYYY-MM-DD") `days` hari dari sekarang. */
function dayFromToday(days: number): string {
  return new Date(Date.now() + 8 * 3600_000 + days * 24 * 3600_000).toISOString().slice(0, 10);
}

let invoicePath: string | null = null;

test("apoteker menyiapkan barang dengan stok 10", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const itemName = `Vitamin Tagihan ${t}`;
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok");
  await page.getByRole("button", { name: "+ Barang" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Tambah barang" });
  await itemDialog.getByLabel("Kode").fill(`E2E-${t}-VIT`);
  await itemDialog.getByLabel("Nama", { exact: true }).fill(itemName);
  await itemDialog.getByLabel("Satuan").fill("tablet");
  await itemDialog.getByLabel("Batas menipis").fill("2");
  await itemDialog.getByLabel("Harga jual").fill("25000");
  await itemDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });

  await page.goto("/admin/stok/masuk/baru");
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplierDialog = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplierDialog.getByLabel("Nama supplier").fill(`Supplier Tagihan ${t}`);
  await supplierDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(supplierDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel("Supplier", { exact: true })).not.toHaveValue("");
  await page.getByLabel("Nomor faktur").fill(`TG-E2E-${t}-001`);
  await page.getByLabel("Barang baris 1").selectOption({ label: `${itemName} (E2E-${t}-VIT)` });
  await page.getByLabel("Jumlah baris 1").fill("10");
  await page.getByLabel("Harga beli baris 1").fill("10000");
  await page.getByLabel("Batch baris 1").fill("B-01");
  await page.getByLabel("Kedaluwarsa baris 1").fill(dayFromToday(365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
});

test("resepsionis menagih penjualan langsung, memfinalkan, dan menerima pembayaran bertahap", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const itemName = `Vitamin Tagihan ${t}`;
  await signIn(page, E2E_RESEPSIONIS);
  await expect(page.getByRole("region", { name: "Tagihan", exact: true })).toBeVisible();

  await page.goto("/admin/tagihan");
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const saleDialog = page.getByRole("dialog", { name: "Penjualan langsung" });
  await saleDialog.getByRole("button", { name: "+ Pasien Baru" }).click();
  await saleDialog.getByLabel("Nama", { exact: true }).fill(`Pelanggan Tagihan ${t}`);
  await saleDialog.getByLabel("Nomor WhatsApp").fill(t === "M" ? "6281200007702" : "6281200007701");
  await saleDialog.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  invoicePath = new URL(page.url()).pathname;

  await page.getByRole("button", { name: "+ Tambah barang" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Tambah barang" });
  await itemDialog.getByLabel("Barang", { exact: true }).selectOption({ label: `${itemName} (E2E-${t}-VIT) — sisa 10 tablet` });
  await itemDialog.getByLabel("Jumlah").fill("2");
  await itemDialog.getByRole("button", { name: "Tambah" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });
  const summary = page.getByRole("region", { name: "Ringkasan tagihan" });
  await expect(summary).toContainText("Rp 50.000", { timeout: 30_000 });

  await page.getByRole("button", { name: "+ Baris layanan" }).click();
  const lineDialog = page.getByRole("dialog", { name: "Tambah baris layanan" });
  await lineDialog.getByLabel("Nama", { exact: true }).fill("Layanan Tagihan");
  await lineDialog.getByLabel("Harga").fill("100000");
  await lineDialog.getByRole("button", { name: "Tambah" }).click();
  await expect(lineDialog).toBeHidden({ timeout: 30_000 });
  await expect(summary).toContainText("Rp 150.000", { timeout: 30_000 });

  // Resepsionis paling banyak 20%: 30% ditolak, 10% diterima.
  await page.getByLabel("Jenis diskon").selectOption("PERSEN");
  await page.getByLabel("Nilai diskon").fill("30");
  await page.getByLabel("Alasan diskon").fill("Pelanggan lama");
  await page.getByRole("button", { name: "Terapkan diskon" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "20%" })).toBeVisible();
  await page.getByLabel("Nilai diskon").fill("10");
  await page.getByRole("button", { name: "Terapkan diskon" }).click();
  await expect(summary).toContainText("Rp 135.000", { timeout: 30_000 });

  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Belum dibayar", { exact: true })).toBeVisible();

  const payments = page.getByRole("region", { name: "Pembayaran" });
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  const dialog = page.getByRole("dialog", { name: "Catat pembayaran" });
  await dialog.getByLabel("Nominal").fill("50000");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Sebagian", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Ringkasan tagihan" })).toContainText("Rp 85.000");

  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  await dialog.getByLabel("Nominal").fill("90000");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog.getByRole("alert")).toContainText("melebihi sisa");
  await dialog.getByLabel("Nominal").fill("85000");
  await dialog.getByLabel("Metode").selectOption("QRIS");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Lunas", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(payments.getByRole("button", { name: "Catat pembayaran" })).toHaveCount(0);

  // Koreksi uang bukan wewenang resepsionis.
  await expect(page.getByRole("button", { name: /Batalkan pembayaran/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tambah diskon" })).toHaveCount(0);
});

test("admin keuangan membatalkan pembayaran lalu tagihan; stok kembali", async ({ page }, testInfo) => {
  test.skip(!invoicePath, "Butuh tagihan dari uji sebelumnya.");
  const t = tag(testInfo);
  const itemName = `Vitamin Tagihan ${t}`;
  await signIn(page, E2E_KEUANGAN);
  await expect(page.getByRole("region", { name: "Tagihan", exact: true })).toBeVisible();
  await page.goto(invoicePath!);
  await expect(page.getByRole("button", { name: "Catat pembayaran" })).toHaveCount(0);

  await page.getByRole("button", { name: /Batalkan pembayaran Rp 50\.000/ }).click();
  const revoke = page.getByRole("dialog", { name: "Batalkan pembayaran?" });
  await revoke.getByLabel("Alasan").fill("Salah catat");
  await revoke.getByRole("button", { name: "Batalkan pembayaran" }).click();
  await expect(revoke).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Sebagian", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Ringkasan tagihan" })).toContainText("Rp 50.000");

  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /Tagihan belum lunas/ })).toBeVisible();

  // Pembayaran lain masih aktif: tagihan belum bisa dibatalkan.
  await page.goto(invoicePath!);
  await page.getByRole("button", { name: "Batalkan tagihan" }).click();
  const cancel = page.getByRole("dialog", { name: "Batalkan tagihan?" });
  await cancel.getByLabel("Alasan").fill("Pelanggan batal");
  await cancel.getByRole("button", { name: "Batalkan tagihan" }).click();
  await expect(cancel.getByRole("alert")).toContainText("Batalkan pembayarannya dulu", { timeout: 30_000 });
  await cancel.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: /Batalkan pembayaran Rp 85\.000/ }).click();
  await revoke.getByLabel("Alasan").fill("Dikembalikan ke pelanggan");
  await revoke.getByRole("button", { name: "Batalkan pembayaran" }).click();
  await expect(revoke).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: "Batalkan tagihan" }).click();
  await cancel.getByLabel("Alasan").fill("Pelanggan batal");
  await cancel.getByRole("button", { name: "Batalkan tagihan" }).click();
  await expect(cancel).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Dibatalkan", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

  await page.context().clearCookies();
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok");
  const row = page.getByRole("region", { name: "Barang", exact: true }).getByRole("row").filter({ hasText: itemName });
  await expect(row).toContainText("10 tablet");
});

test("apoteker tidak bisa membuka Tagihan", async ({ page }) => {
  await signIn(page, E2E_APOTEKER);
  expect((await page.goto("/admin/tagihan"))?.status()).toBe(403);
});
