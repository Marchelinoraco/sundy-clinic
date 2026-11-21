import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

test.setTimeout(300_000);

const FITUR = "Catat barang masuk & retur";

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
  await signIn(page, E2E_ADMIN);
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
  await expect(staff.getByRole("link", { name: "Barang masuk", exact: true }).or(staff.getByRole("tab", { name: "Barang masuk" })).first()).toBeVisible();
  await expect(staff.getByRole("button", { name: "+ Barang", exact: true })).toHaveCount(0);
  await staff.goto("/admin/stok");
  await expect(staff.getByRole("button", { name: "+ Barang", exact: true })).toHaveCount(0);
  await expect(staff.getByRole("button", { name: /penyesuaian/i })).toHaveCount(0);
  const baru = await staff.goto("/admin/stok/masuk/baru");
  expect(baru?.status()).toBe(200);
  await expect(staff).toHaveURL(/\/admin\/stok\/masuk\/baru/);

  // Pemilik mencabut centang: staf kembali ditolak.
  dialog = await bukaDialog();
  await dialog.getByRole("checkbox", { name: FITUR }).uncheck();
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Akses tambahan disimpan.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toBeHidden();
  expect((await staff.goto("/admin/stok"))?.status()).toBe(403);
  expect((await staff.goto("/admin/stok/masuk/baru"))?.status()).toBe(403);

  // Bersih-bersih: nonaktifkan staf uji.
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Nonaktifkan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row).toContainText("Nonaktif", { timeout: 30_000 });
  await staffContext.close();
});
