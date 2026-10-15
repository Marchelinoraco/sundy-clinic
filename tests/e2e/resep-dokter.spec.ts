import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { aturHargaJual, isiHargaBeli } from "./helpers/harga";
import { isiMeja } from "./helpers/stok-meja";
import { isiTanggal, pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Satu cerita per proyek (spec resep dokter 8): Apoteker menyiapkan dua obat (satu stok 10, satu stok 2) → dokter menulis
// resep keduanya (peringatan stok untuk yang kurang) dan memfinalkan → resepsionis membuat tagihan, mengurangi obat yang
// kurang dengan alasan, membuka etiket, memfinalkan → stok berkurang; dokter melihat keterangan penagihan.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const dayFromToday = (days: number) => new Date(Date.now() + 8 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
let encounterPath: string | null = null;

test("apoteker menyiapkan dua obat", async ({ page, browser }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_APOTEKER);
  for (const [suffix, name] of [["RDK", `Kapsul Dokter ${t}`], ["RDV", `Vitamin Dokter ${t}`]] as const) {
    await page.goto("/admin/stok");
    await page.getByRole("button", { name: "+ Barang" }).click();
    const dialog = page.getByRole("dialog", { name: "Tambah barang" });
    await dialog.getByLabel("Kode").fill(`E2E-${t}-${suffix}`);
    await dialog.getByLabel("Nama", { exact: true }).fill(name);
    await dialog.getByLabel("Satuan").fill("tablet");
    await dialog.getByLabel("Batas menipis").fill("1");
    await dialog.getByRole("button", { name: "Simpan" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await aturHargaJual(browser, name, "3000");
  }
  await page.goto("/admin/stok/masuk/baru");
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplier = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplier.getByLabel("Nama supplier").fill(`Supplier Dokter ${t}`);
  await supplier.getByRole("button", { name: "Simpan" }).click();
  await expect(supplier).toBeHidden({ timeout: 30_000 });
  await page.getByLabel("Nomor faktur").fill(`RSD-E2E-${t}-001`);
  await pilihOpsi(page, "Barang baris 1", `Kapsul Dokter ${t} (E2E-${t}-RDK)`);
  await page.getByLabel("Jumlah baris 1").fill("10");
  await page.getByLabel("Batch baris 1").fill("A-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", dayFromToday(365));
  await page.getByRole("button", { name: "+ Tambah baris" }).click();
  await pilihOpsi(page, "Barang baris 2", `Vitamin Dokter ${t} (E2E-${t}-RDV)`);
  await page.getByLabel("Jumlah baris 2").fill("2");
  await page.getByLabel("Batch baris 2").fill("V-01");
  await isiTanggal(page, "Kedaluwarsa baris 2", dayFromToday(365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
  await isiHargaBeli(browser, new URL(page.url()).pathname, ["1000", "1000"]);
  // Tagihan mengambil stok meja (spec stok meja SM1).
  await isiMeja(browser, `Kapsul Dokter ${t}`, "10");
  await isiMeja(browser, `Vitamin Dokter ${t}`, "2");
});

test("dokter menulis resep dua obat dengan peringatan stok lalu memfinalkan", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_ADMIN);
  await page.getByRole("region", { name: "Pasien hari ini" }).getByRole("row").filter({ hasText: `Pasien Resep ${testInfo.project.name}` }).getByRole("button", { name: "Periksa" }).click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  encounterPath = new URL(page.url()).pathname;
  await page.getByLabel("Penilaian / diagnosis").fill("Infeksi saluran napas");
  await expect(page.getByLabel("Catatan untuk Apoteker")).toHaveCount(0);

  await page.getByRole("button", { name: "Tambah obat" }).click();
  const first = page.getByRole("group", { name: "Obat 1" });
  await first.getByLabel("Obat").selectOption({ label: `Kapsul Dokter ${t} (E2E-${t}-RDK)` });
  await first.getByLabel("Jumlah").fill("6");
  await first.getByLabel("Aturan pakai").fill("3 x 1 sesudah makan");
  await page.getByRole("button", { name: "Tambah obat" }).click();
  const second = page.getByRole("group", { name: "Obat 2" });
  await second.getByLabel("Obat").selectOption({ label: `Vitamin Dokter ${t} (E2E-${t}-RDV)` });
  await second.getByLabel("Jumlah").fill("5");
  await second.getByLabel("Aturan pakai").fill("1 x 1 pagi");
  await expect(second.getByRole("alert")).toContainText("Sisa stok 2 tablet");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Finalisasi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
});

test("resepsionis mengurangi obat yang kurang, mencetak etiket, dan memfinalkan; stok berkurang", async ({ page, browser }, testInfo) => {
  const t = tag(testInfo);
  const name = `Pasien Resep ${testInfo.project.name}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: `Buat tagihan ${name}` }).click();
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  const vitamin = `Vitamin Dokter ${t}`;
  await expect(page.getByLabel(`Jumlah ${vitamin}`)).toHaveValue("5", { timeout: 30_000 });

  await page.getByRole("button", { name: `Kurangi ${vitamin}` }).click();
  const reduce = page.getByRole("dialog", { name: `Kurangi ${vitamin}` });
  await reduce.getByLabel("Jumlah ditagih").fill("2");
  await reduce.getByLabel("Alasan").fill("Stok kurang");
  await reduce.getByRole("button", { name: "Simpan" }).click();
  await expect(reduce).toBeHidden({ timeout: 30_000 });
  await expect(page.getByLabel(`Jumlah ${vitamin}`)).toHaveValue("2", { timeout: 30_000 });

  // Obat dijadikan 0 lalu dikembalikan tanpa membatalkan tagihan.
  const amox = `Kapsul Dokter ${t}`;
  await page.getByRole("button", { name: `Kurangi ${amox}` }).click();
  const drop = page.getByRole("dialog", { name: `Kurangi ${amox}` });
  await drop.getByLabel("Jumlah ditagih").fill("0");
  await drop.getByLabel("Alasan").fill("Pasien menolak");
  await drop.getByRole("button", { name: "Simpan" }).click();
  await expect(drop).toBeHidden({ timeout: 30_000 });
  const dropped = page.getByRole("region", { name: "Obat resep tidak ditagih" });
  await expect(dropped).toContainText("Pasien menolak", { timeout: 30_000 });
  await expect(page.getByLabel(`Jumlah ${amox}`)).toHaveCount(0);
  await dropped.getByRole("button", { name: `Kembalikan ${amox}` }).click();
  await expect(page.getByLabel(`Jumlah ${amox}`)).toHaveValue("6", { timeout: 30_000 });
  await expect(dropped).toHaveCount(0);
  await expect(page.getByText("Obat sudah diserahkan.")).toHaveCount(0);

  await page.getByRole("link", { name: "Cetak etiket" }).click();
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+\/etiket$/, { timeout: 30_000 });
  const label = page.getByRole("article", { name: "Etiket obat" });
  await expect(label).toContainText("3 x 1 sesudah makan");
  await expect(label).toContainText("Jumlah: 2");
  await expect(label).not.toContainText("Rp");
  await page.goBack();

  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  const pharmacy = await browser.newContext(testInfo.project.use);
  const ap = await pharmacy.newPage();
  await signIn(ap, E2E_APOTEKER);
  await ap.goto("/admin/stok");
  const items = ap.getByRole("region", { name: "Barang", exact: true });
  await expect(items.getByRole("row").filter({ hasText: `Kapsul Dokter ${t}` })).toContainText("4 tablet");
  await expect(items.getByRole("row").filter({ hasText: vitamin })).toContainText("0 tablet");
  await pharmacy.close();
});

test("dokter melihat keterangan penagihan; hak akses", async ({ page }, testInfo) => {
  test.skip(!encounterPath, "Butuh kunjungan dari uji sebelumnya.");
  const t = tag(testInfo);
  await signIn(page, E2E_ADMIN);
  await page.goto(encounterPath!);
  await expect(page.getByRole("table", { name: "Resep" })).toContainText(`Ditagih 2 dari 5 — Stok kurang`, { timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Resep" })).toContainText(`Kapsul Dokter ${t}`);

  await page.context().clearCookies();
  await signIn(page, E2E_APOTEKER);
  expect((await page.goto("/admin/tagihan"))?.status()).toBe(403);
  await page.context().clearCookies();
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/resep"))?.status()).toBe(403);
  expect((await page.goto("/admin/stok-dokter"))?.status()).toBe(403);
  await page.context().clearCookies();
  await signIn(page, E2E_KEUANGAN);
  expect((await page.goto("/admin/stok-dokter"))?.status()).toBe(403);
});
