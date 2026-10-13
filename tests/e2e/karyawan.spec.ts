import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { isiTanggal, tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Satu cerita per proyek (spec karyawan 7): Admin Keuangan menambah karyawan tanpa akun → penggajian bulan ini → potongan →
// tandai dibayar → Pengeluaran memuat Gaji Karyawan. Resepsionis tidak bisa membuka menu ini.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const stamp = Date.now().toString().slice(-6);
const month = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 7);
const today = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10);

test("Admin Keuangan menggaji karyawan tanpa akun dan pembayarannya masuk Pengeluaran", async ({ page }, testInfo) => {
  const name = `Satpam E2E ${tag(testInfo)} ${stamp}`;
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/karyawan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Karyawan" }).click();
  const add = page.getByRole("dialog", { name: "Tambah karyawan" });
  await add.getByLabel("Nama", { exact: true }).fill(name);
  await add.getByLabel("Jabatan").fill("Satpam");
  await isiTanggal(add, "Tanggal masuk", `${month}-01`);
  await add.getByLabel("Gaji pokok").fill("2500000");
  await add.getByRole("button", { name: "Simpan" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("Rp 2.500.000", { timeout: 30_000 });

  await page.goto(`/admin/karyawan/penggajian/${month}`);
  await tungguHidrasi(page);
  const create = page.getByRole("button", { name: `Buat penggajian ${month}` });
  if (await create.isVisible()) {
    await create.click();
  } else {
    await page.getByLabel("Tambah karyawan").selectOption({ label: name });
    await page.getByRole("button", { name: "Tambah", exact: true }).click();
  }
  const row = page.getByRole("row", { name: new RegExp(name) });
  await expect(row).toContainText("Belum dibayar", { timeout: 30_000 });

  await row.getByRole("button", { name: `Penyesuaian ${name}` }).click();
  const adjust = page.getByRole("dialog", { name: `Penyesuaian — ${name}` });
  await adjust.getByLabel("Nominal").fill("100000");
  await adjust.getByLabel("Keterangan").fill("Kasbon E2E");
  await adjust.getByRole("button", { name: "Tambah" }).click();
  await expect(adjust).toContainText("Kasbon E2E", { timeout: 30_000 });
  await adjust.getByRole("button", { name: "Close" }).click();
  await expect(row).toContainText("Rp 2.400.000", { timeout: 30_000 });

  await row.getByRole("button", { name: `Tandai dibayar ${name}` }).click();
  const pay = page.getByRole("dialog", { name: `Tandai dibayar — ${name}` });
  await pay.getByRole("button", { name: "Bayar" }).click();
  await expect(row).toContainText(`Dibayar ${today}`, { timeout: 30_000 });

  await page.goto(`/admin/pengeluaran?bulan=${month}`);
  await expect(page.getByText(`Penggajian ${month} · ${name}`)).toBeVisible({ timeout: 30_000 });
});

test("Resepsionis tidak bisa membuka menu Karyawan", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/karyawan"))?.status()).toBe(403);
  expect((await page.goto(`/admin/karyawan/penggajian/${month}`))?.status()).toBe(403);
});
