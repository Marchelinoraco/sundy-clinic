import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { isiTanggal, pilihOpsi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Satu cerita berurutan per proyek (desktop/ponsel, data masing-masing):
// Apoteker menyiapkan stok → dokter memfinalkan dengan Catatan untuk Apoteker → resepsionis menagih (tertahan)
// → Apoteker menyerahkan obat → resepsionis memfinalkan tagihan → stok berkurang → hak akses.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");

/** Tanggal WITA ("YYYY-MM-DD") `days` hari dari sekarang. */
function dayFromToday(days: number): string {
  return new Date(Date.now() + 8 * 3600_000 + days * 24 * 3600_000).toISOString().slice(0, 10);
}

let invoicePath: string | null = null;

test("apoteker menyiapkan obat dengan stok 10", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const itemName = `Amoxicillin Resep ${t}`;
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok");
  await page.getByRole("button", { name: "+ Barang" }).click();
  const itemDialog = page.getByRole("dialog", { name: "Tambah barang" });
  await itemDialog.getByLabel("Kode").fill(`E2E-${t}-RSP`);
  await itemDialog.getByLabel("Nama", { exact: true }).fill(itemName);
  await itemDialog.getByLabel("Satuan").fill("kapsul");
  await itemDialog.getByLabel("Batas menipis").fill("2");
  await itemDialog.getByLabel("Harga jual").fill("3000");
  await itemDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });

  await page.goto("/admin/stok/masuk/baru");
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplierDialog = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplierDialog.getByLabel("Nama supplier").fill(`Supplier Resep ${t}`);
  await supplierDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(supplierDialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel("Supplier", { exact: true })).not.toHaveValue("");
  await page.getByLabel("Nomor faktur").fill(`RSP-E2E-${t}-001`);
  await pilihOpsi(page, "Barang baris 1", `${itemName} (E2E-${t}-RSP)`);
  await page.getByLabel("Jumlah baris 1").fill("10");
  await page.getByLabel("Harga beli baris 1").fill("1000");
  await page.getByLabel("Batch baris 1").fill("B-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", dayFromToday(365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
});

test("dokter memfinalkan kunjungan dengan Catatan untuk Apoteker", async ({ page }, testInfo) => {
  await signIn(page, E2E_ADMIN);
  const today = page.getByRole("region", { name: "Pasien hari ini" });
  await today.getByRole("row").filter({ hasText: `Pasien Resep ${testInfo.project.name}` }).getByRole("button", { name: "Periksa" }).click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await page.getByLabel("Penilaian / diagnosis").fill("Infeksi saluran napas");
  await page.getByLabel("Catatan untuk Apoteker").fill("Amoxicillin 3x1 selama 5 hari");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Finalisasi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
});

test("resepsionis menagih: finalisasi tertahan dan catatan tidak terlihat", async ({ page }, testInfo) => {
  const name = `Pasien Resep ${testInfo.project.name}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await page.getByRole("button", { name: `Buat tagihan ${name}` }).click();
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  invoicePath = new URL(page.url()).pathname;
  await expect(page.getByRole("status").filter({ hasText: "Menunggu Apoteker menyerahkan obat." })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Finalkan tagihan" })).toBeDisabled();
  await expect(page.getByText("Amoxicillin 3x1")).toHaveCount(0);
});

test("apoteker menyerahkan obat dan mencetak etiket; data klinis lain tertutup", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const itemName = `Amoxicillin Resep ${t}`;
  const name = `Pasien Resep ${testInfo.project.name}`;
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/resep");
  await page.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/admin\/resep\/[^/?]+$/, { timeout: 30_000 });
  await expect(page.getByRole("region", { name: "Catatan untuk Apoteker" })).toContainText("Amoxicillin 3x1 selama 5 hari");
  await expect(page.getByText("Infeksi saluran napas")).toHaveCount(0);

  await pilihOpsi(page, "Obat", `${itemName} (E2E-${t}-RSP) — sisa 10 kapsul`);
  await page.getByLabel("Jumlah", { exact: true }).fill("2");
  await page.getByLabel("Aturan pakai", { exact: true }).fill("3 x 1 sesudah makan");
  await page.getByRole("button", { name: "+ Tambah obat" }).click();
  await expect(page.getByLabel(`Jumlah ${itemName}`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByText("Selesai", { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: "Cetak etiket" }).click();
  await expect(page).toHaveURL(/\/admin\/resep\/[^/?]+\/etiket$/, { timeout: 30_000 });
  const label = page.getByRole("article", { name: "Etiket obat" });
  await expect(label).toContainText("3 x 1 sesudah makan");
  await expect(label).toContainText(name);
  await expect(label).not.toContainText("Rp");
});

test("resepsionis memfinalkan tagihan; baris obat terkunci; stok berkurang", async ({ page }, testInfo) => {
  test.skip(!invoicePath, "Butuh tagihan dari uji sebelumnya.");
  const t = tag(testInfo);
  const itemName = `Amoxicillin Resep ${t}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto(invoicePath!);
  await expect(page.getByRole("status").filter({ hasText: "Obat sudah diserahkan." })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel("Dari penyerahan Apoteker")).toBeVisible();
  await expect(page.getByLabel(`Jumlah ${itemName}`)).toBeDisabled();
  await expect(page.getByRole("button", { name: `Hapus ${itemName}` })).toHaveCount(0);
  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  await page.context().clearCookies();
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok");
  const row = page.getByRole("region", { name: "Barang", exact: true }).getByRole("row").filter({ hasText: itemName });
  await expect(row).toContainText("8 kapsul");
});

test("hak akses: resepsionis tidak membuka Resep dan Stok obat; admin keuangan tidak membuka Stok obat", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/resep"))?.status()).toBe(403);
  expect((await page.goto("/admin/stok-dokter"))?.status()).toBe(403);
  await page.context().clearCookies();
  await signIn(page, E2E_KEUANGAN);
  expect((await page.goto("/admin/stok-dokter"))?.status()).toBe(403);
});
