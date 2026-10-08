import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { isiTanggal, pilihOpsi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Satu cerita berurutan per proyek (desktop/ponsel, data masing-masing):
// Apoteker menambah barang, mencatat barang masuk dua batch, meretur sebagian →
// Admin Keuangan membayar sebagian lalu melunasi → Resepsionis tidak bisa membuka keduanya.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");

/** Tanggal WITA ("YYYY-MM-DD") `days` hari dari sekarang. */
function dayFromToday(days: number): string {
  return new Date(Date.now() + 8 * 3600_000 + days * 24 * 3600_000).toISOString().slice(0, 10);
}

let invoicePath: string | null = null;

test("apoteker menambah barang, mencatat barang masuk dua batch, lalu meretur sebagian", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const itemName = `Amoxicillin E2E ${t}`;
  await signIn(page, E2E_APOTEKER);
  await expect(page.getByRole("region", { name: "Stok", exact: true })).toBeVisible();

  await page.goto("/admin/stok");
  await page.getByRole("button", { name: "+ Barang" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Tambah barang" });
  await itemDialog.getByLabel("Kode").fill(`E2E-${t}-OBT`);
  await itemDialog.getByLabel("Nama", { exact: true }).fill(itemName);
  await itemDialog.getByLabel("Satuan").fill("kapsul");
  await itemDialog.getByLabel("Batas menipis").fill("20");
  await itemDialog.getByLabel("Harga jual").fill("2000");
  await itemDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });
  const items = page.getByRole("region", { name: "Barang", exact: true });
  await expect(items.getByRole("row").filter({ hasText: itemName })).toContainText("0 kapsul", { timeout: 30_000 });

  await page.goto("/admin/stok?tab=masuk");
  await page.getByRole("link", { name: "+ Barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/baru$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplierDialog = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplierDialog.getByLabel("Nama supplier").fill(`Supplier E2E ${t}`);
  await supplierDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(supplierDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel("Supplier", { exact: true })).not.toHaveValue("");

  await page.getByLabel("Nomor faktur").fill(`E2E-${t}-001`);
  const option = `${itemName} (E2E-${t}-OBT)`;
  await pilihOpsi(page, "Barang baris 1", option);
  await page.getByLabel("Jumlah baris 1").fill("10");
  await page.getByLabel("Harga beli baris 1").fill("5000");
  await page.getByLabel("Batch baris 1").fill("B-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", dayFromToday(365));
  await page.getByRole("button", { name: "+ Tambah baris" }).click();
  await pilihOpsi(page, "Barang baris 2", option);
  await page.getByLabel("Jumlah baris 2").fill("6");
  await page.getByLabel("Harga beli baris 2").fill("5000");
  await page.getByLabel("Batch baris 2").fill("B-02");
  await isiTanggal(page, "Kedaluwarsa baris 2", dayFromToday(400));
  await expect(page.getByText("Rp 80.000")).toBeVisible();
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();

  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
  invoicePath = new URL(page.url()).pathname;
  await expect(page.getByText("Belum dibayar", { exact: true })).toBeVisible();
  // Apoteker tidak melihat bagian pembayaran (spec stok 6.2).
  await expect(page.getByRole("region", { name: "Pembayaran" })).toHaveCount(0);

  await page.getByRole("button", { name: "Retur ke supplier" }).click();
  const returnDialog = page.getByRole("dialog", { name: "Retur ke supplier" });
  await returnDialog.getByLabel(`Jumlah retur ${itemName} batch B-01`).fill("2");
  await returnDialog.getByRole("button", { name: "Simpan retur" }).click();
  await expect(returnDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Retur", exact: true })).toContainText("Rp 10.000", { timeout: 30_000 });

  await page.goto("/admin/stok");
  const row = page.getByRole("region", { name: "Barang", exact: true }).getByRole("row").filter({ hasText: itemName });
  await expect(row).toContainText("14 kapsul");
  await expect(row).toContainText("Menipis");

  const response = await page.goto("/admin/hutang");
  expect(response?.status()).toBe(403);
});

test("admin keuangan membayar sebagian lalu melunasi, dan tidak bisa mengubah stok", async ({ page }, testInfo) => {
  test.skip(!invoicePath, "Butuh faktur dari uji sebelumnya.");
  const t = tag(testInfo);
  await signIn(page, E2E_KEUANGAN);
  await expect(page.getByRole("region", { name: "Hutang", exact: true })).toBeVisible();

  await page.goto("/admin/hutang");
  // Tautan bernama persis: faktur spek lain ("TG-E2E-…-001", "RSP-E2E-…-001") juga memuat teks ini.
  const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: `E2E-${t}-001`, exact: true }) });
  await expect(row).toContainText("Rp 70.000");
  await row.getByRole("link", { name: `E2E-${t}-001` }).click();
  await expect(page).toHaveURL(new RegExp(`${invoicePath}$`), { timeout: 30_000 });

  const payments = page.getByRole("region", { name: "Pembayaran" });
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  const dialog = page.getByRole("dialog", { name: "Catat pembayaran" });
  await dialog.getByLabel("Nominal").fill("30000");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Sebagian", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Bawaannya nominal = sisa hutang (Rp 40.000).
  await payments.getByRole("button", { name: "Catat pembayaran" }).click();
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Lunas", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(payments.getByRole("button", { name: "Catat pembayaran" })).toHaveCount(0);

  await page.goto("/admin/stok");
  await expect(page.getByRole("region", { name: "Barang", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "+ Barang" })).toHaveCount(0);
});

test("resepsionis tidak bisa membuka Stok atau Hutang", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/stok"))?.status()).toBe(403);
  expect((await page.goto("/admin/hutang"))?.status()).toBe(403);
});
