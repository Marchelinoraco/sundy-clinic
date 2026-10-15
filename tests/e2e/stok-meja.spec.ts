import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { aturHargaJual } from "./helpers/harga";
import { isiTanggal, pilihOpsi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

// Satu cerita per proyek (spec stok meja 9): Apoteker menyiapkan barang berbatas meja → resepsionis melihat Meja habis
// dan meminta restock → Apoteker diberi tahu, mengirim sebagian → resepsionis diberi tahu → tagihan mengambil meja.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const dayFromToday = (days: number) => new Date(Date.now() + 8 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

async function openAs(browser: Browser, testInfo: TestInfo, account: { email: string; password: string }, path: string): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use);
  const page = await context.newPage();
  await signIn(page, account);
  await page.goto(path);
  return page;
}

test("apoteker menyiapkan barang dengan batas meja dan stok gudang 20", async ({ page, browser }, testInfo) => {
  const t = tag(testInfo);
  const name = `Salep Meja ${t}`;
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok");
  await page.getByRole("button", { name: "+ Barang" }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah barang" });
  await dialog.getByLabel("Kode").fill(`E2E-${t}-SLP`);
  await dialog.getByLabel("Nama", { exact: true }).fill(name);
  await dialog.getByLabel("Satuan").fill("tube");
  await dialog.getByLabel("Batas menipis").fill("2");
  await dialog.getByLabel("Batas meja").fill("5");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await aturHargaJual(browser, name, "40000");

  await page.goto("/admin/stok/masuk/baru");
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplier = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplier.getByLabel("Nama supplier").fill(`Supplier Meja ${t}`);
  await supplier.getByRole("button", { name: "Simpan" }).click();
  await expect(supplier).toBeHidden({ timeout: 30_000 });
  await page.getByLabel("Nomor faktur").fill(`SM-E2E-${t}-001`);
  await pilihOpsi(page, "Barang baris 1", `${name} (E2E-${t}-SLP)`);
  await page.getByLabel("Jumlah baris 1").fill("20");
  await page.getByLabel("Batch baris 1").fill("M-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", dayFromToday(365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
});

test("resepsionis meminta restock; Apoteker mengirim sebagian; keduanya diberi tahu tanpa muat ulang", async ({ browser }, testInfo) => {
  const t = tag(testInfo);
  const name = `Salep Meja ${t}`;
  const pharmacist = await openAs(browser, testInfo, E2E_APOTEKER, "/admin");
  const receptionist = await openAs(browser, testInfo, E2E_RESEPSIONIS, "/admin/stok-meja");
  await expect(pharmacist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();

  const row = receptionist.getByRole("table", { name: "Stok meja" }).getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Meja habis");
  await expect(row).toContainText("0 tube");
  await expect(receptionist.getByRole("table", { name: "Stok meja" })).not.toContainText("Rp");

  await receptionist.getByRole("button", { name: "Minta restock" }).click();
  const dialog = receptionist.getByRole("dialog", { name: "Minta restock" });
  await dialog.getByRole("button", { name: "Kirim permintaan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const pending = receptionist.getByRole("region", { name: "Permintaan menunggu" });
  await expect(pending).toContainText(`${name}: diminta 10 tube`, { timeout: 30_000 });
  await expect(row).toContainText("Sudah diminta");

  await expect(pharmacist.getByText(/^Permintaan restock dari .+: \d+ barang$/)).toBeVisible({ timeout: 40_000 });
  await pharmacist.goto("/admin/stok?tab=permintaan");
  await pharmacist
    .getByRole("region", { name: "Permintaan menunggu" })
    .getByRole("listitem")
    .filter({ hasText: name })
    .getByRole("link", { name: "Proses" })
    .click();
  await expect(pharmacist).toHaveURL(/\/admin\/stok\/permintaan\/[^/?]+$/, { timeout: 30_000 });
  await expect(pharmacist.getByLabel(`Dikirim ${name}`)).toHaveValue("10");
  await pharmacist.getByLabel(`Dikirim ${name}`).fill("6");
  await pharmacist.getByRole("button", { name: "Kirim ke meja" }).click();
  await expect(pharmacist.getByRole("region", { name: "Hasil" })).toContainText(`${name}: diminta 10 tube · dikirim 6 tube`, { timeout: 30_000 });

  await expect(receptionist.getByText(/^Restock dikirim: \d+ barang$/)).toBeVisible({ timeout: 40_000 });
  await receptionist.goto("/admin/stok-meja?tampil=semua");
  await expect(receptionist.getByRole("table", { name: "Stok meja" }).getByRole("row").filter({ hasText: name })).toContainText("6 tube");

  await Promise.all([pharmacist.context().close(), receptionist.context().close()]);
});

test("tagihan mengambil stok meja, gudang tetap; hak akses", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const name = `Salep Meja ${t}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  await page.getByRole("dialog", { name: "Penjualan langsung" }).getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(page, { name: `Pelanggan Meja ${t}`, whatsapp: t === "M" ? "6281200007722" : "6281200007721" });
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await page.getByRole("button", { name: "+ Tambah barang" }).click();
  const add = page.getByRole("dialog", { name: "Tambah barang" });
  await pilihOpsi(add, "Barang", `${name} (E2E-${t}-SLP) — sisa 6 tube`);
  await add.getByLabel("Jumlah").fill("2");
  await add.getByRole("button", { name: "Tambah" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/stok-meja?tampil=semua");
  const row = page.getByRole("table", { name: "Stok meja" }).getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("4 tube");
  await expect(row).toContainText("Meja menipis");
  expect((await page.goto("/admin/stok"))?.status()).toBe(403);

  await page.context().clearCookies();
  await signIn(page, E2E_APOTEKER);
  await page.goto(`/admin/stok?cari=${encodeURIComponent(name)}`);
  const stock = page.getByRole("region", { name: "Barang", exact: true }).getByRole("row").filter({ hasText: name });
  await expect(stock).toContainText("14 tube");
  await expect(stock).toContainText("Meja menipis");

  await page.context().clearCookies();
  await signIn(page, E2E_KEUANGAN);
  expect((await page.goto("/admin/stok-meja"))?.status()).toBe(403);
});
