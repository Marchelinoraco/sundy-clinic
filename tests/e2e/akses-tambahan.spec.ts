import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { isiTanggal, pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

test.setTimeout(300_000);

const FITUR = "Catat barang masuk & retur";

const dayFromToday = (days: number) => new Date(Date.now() + 8 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);

async function menuStok(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Buka menu" }).click();
  // Di ponsel menu samping berupa laci (dialog), di desktop berupa navigasi "Menu admin".
  const menu = isMobile ? page.getByRole("dialog") : page.getByRole("navigation", { name: "Menu admin" });
  await expect(menu.getByRole("link", { name: "Dasbor" })).toBeVisible();
  return menu.getByRole("link", { name: "Stok", exact: true });
}

test("akses tambahan: Super Admin memberi lalu mencabut akses Catat barang masuk bagi Resepsionis", async ({ page, browser, isMobile }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `Staf Akses ${suffix}`;
  const email = `e2e-akses-${suffix}@sundy.test`;
  const newPassword = `KataSandiBaru${Date.now()}`;

  // Pemilik menambah staf Resepsionis.
  // Data stok untuk kontrol positif: satu barang dengan satu batch, dibuat pemilik.
  const t = testInfo.project.name === "mobile" ? "M" : "D";
  const item = `Barang Akses ${suffix}`;
  const kode = `E2E-AKS-${suffix}`.toUpperCase();
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/stok");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Barang", exact: true }).click();
  const barang = page.getByRole("dialog", { name: "Tambah barang" });
  await barang.getByLabel("Kode").fill(kode);
  await barang.getByLabel("Nama", { exact: true }).fill(item);
  await barang.getByLabel("Satuan").fill("tube");
  await barang.getByRole("button", { name: "Simpan" }).click();
  await expect(barang).toBeHidden({ timeout: 30_000 });
  await page.goto("/admin/stok/masuk/baru");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplier = page.getByRole("dialog", { name: "Tambah supplier" });
  await supplier.getByLabel("Nama supplier").fill(`Supplier Akses ${suffix}`);
  await supplier.getByRole("button", { name: "Simpan" }).click();
  await expect(supplier).toBeHidden({ timeout: 30_000 });
  await page.getByLabel("Nomor faktur").fill(`AKS-${t}-${Date.now()}`);
  await pilihOpsi(page, "Barang baris 1", `${item} (${kode})`);
  await page.getByLabel("Jumlah baris 1").fill("5");
  await page.getByLabel("Batch baris 1").fill("AKS-01");
  await isiTanggal(page, "Kedaluwarsa baris 1", dayFromToday(365));
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
  // Kontrol positif: pemilik melihat "Ubah barang" dan "Penyesuaian" pada barang itu.
  await page.goto(`/admin/stok?cari=${encodeURIComponent(item)}`);
  await tungguHidrasi(page);
  await page.getByRole("link", { name: item, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/stok\/barang\/[^/]+$/, { timeout: 30_000 });
  const detailUrl = new URL(page.url()).pathname;
  await tungguHidrasi(page);
  await expect(page.getByRole("button", { name: "Ubah barang" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Penyesuaian / })).toBeVisible();

  await page.goto("/admin/staf");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Tambah staf" }).click();
  const form = page.getByRole("dialog", { name: "Tambah staf" });
  await form.getByLabel("Nama").fill(name);
  await form.getByLabel("Peran").selectOption("RESEPSIONIS");
  await form.getByLabel("Email login").fill(email);
  await form.getByRole("button", { name: "Tambah staf" }).click();
  const temp = page.getByRole("dialog", { name: `Kata sandi sementara — ${name}` });
  const tempPassword = ((await temp.getByTestId("kata-sandi-sementara").textContent()) ?? "").trim();
  expect(tempPassword).toHaveLength(16);
  await temp.getByRole("button", { name: "Tutup" }).click();
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toContainText("Wajib ganti kata sandi", { timeout: 30_000 });

  // Staf masuk dan mengganti kata sandi sementara.
  const staffContext = await browser.newContext({ ...testInfo.project.use, baseURL: E2E_BASE_URL });
  const staff = await staffContext.newPage();
  await staff.goto("/masuk");
  await staff.waitForLoadState("networkidle");
  await staff.getByLabel("Email").fill(email);
  await staff.getByLabel("Kata Sandi").fill(tempPassword);
  await staff.getByRole("button", { name: "Masuk" }).click();
  await expect(staff).toHaveURL(/\/ganti-kata-sandi/, { timeout: 60_000 });
  await staff.getByLabel("Kata sandi saat ini").fill(tempPassword);
  await staff.getByLabel("Kata sandi baru", { exact: true }).fill(newPassword);
  await staff.getByLabel("Ulangi kata sandi baru").fill(newPassword);
  await staff.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(staff).toHaveURL(/\/admin$/, { timeout: 60_000 });

  // Sebelum diberi akses: menu Stok tidak ada, /admin/stok ditolak.
  await expect(await menuStok(staff, isMobile)).toBeHidden();
  expect((await staff.goto("/admin/stok"))?.status()).toBe(403);

  // Pemilik mencentang Catat barang masuk & retur.
  const bukaDialog = async () => {
    await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
    await page.getByRole("menuitem", { name: "Akses tambahan" }).click();
    const dialog = page.getByRole("dialog", { name: `Akses tambahan — ${name}` });
    await expect(dialog).toBeVisible();
    return dialog;
  };
  let dialog = await bukaDialog();
  await dialog.getByRole("checkbox", { name: FITUR }).check();
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Akses tambahan disimpan.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toBeHidden();

  // Staf memuat ulang: Stok muncul, hanya fitur itu.
  await staff.goto("/admin/stok?tab=masuk");
  await tungguHidrasi(staff);
  await expect(await menuStok(staff, isMobile)).toBeVisible();
  await staff.keyboard.press("Escape");
  await expect(staff.getByRole("link", { name: "+ Barang masuk" })).toBeVisible();
  await expect(staff.getByRole("link", { name: "Barang masuk", exact: true })).toBeVisible();
  await expect(staff.getByRole("button", { name: "+ Barang", exact: true })).toHaveCount(0);
  await staff.goto("/admin/stok");
  await tungguHidrasi(staff);
  await expect(staff.getByRole("heading", { name: "Stok", exact: true })).toBeVisible();
  await expect(staff.getByRole("button", { name: "+ Barang", exact: true })).toHaveCount(0);
  // Halaman barang yang sama dengan kontrol positif pemilik: tombol ubah dan penyesuaian tidak ada.
  await staff.goto(detailUrl);
  await tungguHidrasi(staff);
  await expect(staff.getByRole("heading", { name: item })).toBeVisible();
  await expect(staff.getByRole("cell", { name: "AKS-01", exact: true })).toBeVisible();
  await expect(staff.getByRole("button", { name: "Ubah barang" })).toHaveCount(0);
  await expect(staff.getByRole("button", { name: /^Penyesuaian / })).toHaveCount(0);
  const baru = await staff.goto("/admin/stok/masuk/baru");
  expect(baru?.status()).toBe(200);
  await expect(staff).toHaveURL(/\/admin\/stok\/masuk\/baru/);

  // Pemilik mencabut centang: staf kembali ditolak.
  dialog = await bukaDialog();
  await dialog.getByRole("checkbox", { name: FITUR }).uncheck();
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Akses tambahan disimpan.").last()).toBeVisible();
  expect((await staff.goto("/admin/stok"))?.status()).toBe(403);
  expect((await staff.goto("/admin/stok/masuk/baru"))?.status()).toBe(403);

  // Bersih-bersih: nonaktifkan staf uji.
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Nonaktifkan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row).toContainText("Nonaktif", { timeout: 30_000 });
  await staffContext.close();
});
