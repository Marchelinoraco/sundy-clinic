import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

test.setTimeout(240_000);

test("pemilik menambah staf; staf dipaksa mengganti kata sandi lalu bekerja; pemilik menonaktifkannya", async ({ page, browser }, testInfo) => {
  const suffix = `${testInfo.project.name}-${Date.now()}`;
  const name = `Staf Uji ${suffix}`;
  const email = `e2e-staf-${suffix}@sundy.test`;
  const newPassword = `KataSandiBaru${Date.now()}`;

  // Pemilik menambah staf.
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

  // Staf masuk dengan kata sandi sementara: diarahkan ke Ganti kata sandi, belum bisa memakai panel atau rute apa pun.
  const staffContext = await browser.newContext({ ...testInfo.project.use, baseURL: E2E_BASE_URL });
  const staff = await staffContext.newPage();
  await staff.goto("/masuk");
  await staff.waitForLoadState("networkidle");
  await staff.getByLabel("Email").fill(email);
  await staff.getByLabel("Kata Sandi").fill(tempPassword);
  await staff.getByRole("button", { name: "Masuk" }).click();
  await expect(staff).toHaveURL(/\/ganti-kata-sandi/, { timeout: 60_000 });
  // Halaman ini tidak masuk daftar foto halaman admin (butuh akun yang wajib ganti): periksa sekilas di mode gelap, tanpa gulir mendatar.
  await staff.emulateMedia({ colorScheme: "dark" });
  await expect(staff.getByLabel("Kata sandi saat ini")).toBeVisible();
  expect(await staff.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await staff.goto("/admin");
  await expect(staff).toHaveURL(/\/ganti-kata-sandi/, { timeout: 60_000 });
  expect((await staff.request.post("/admin/bia/unggah")).status()).toBe(401);

  // Kata sandi sementara tidak boleh dipakai ulang sebagai kata sandi baru; yang baru diterima.
  await staff.getByLabel("Kata sandi saat ini").fill(tempPassword);
  await staff.getByLabel("Kata sandi baru", { exact: true }).fill(tempPassword);
  await staff.getByLabel("Ulangi kata sandi baru").fill(tempPassword);
  await staff.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(staff.getByRole("alert").filter({ hasText: "Kata sandi baru harus berbeda dari yang sementara." })).toBeVisible();
  await staff.getByLabel("Kata sandi baru", { exact: true }).fill(newPassword);
  await staff.getByLabel("Ulangi kata sandi baru").fill(newPassword);
  await staff.getByRole("button", { name: "Simpan kata sandi baru" }).click();
  await expect(staff).toHaveURL(/\/admin$/, { timeout: 60_000 });

  // Resepsionis tidak bisa membuka halaman Staf.
  const forbidden = await staff.goto("/admin/staf");
  expect(forbidden?.status()).toBe(403);

  // Pemilik menonaktifkan: staf langsung keluar.
  await row.getByRole("button", { name: `Aksi lain ${name}` }).click();
  await page.getByRole("menuitem", { name: "Nonaktifkan" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row).toContainText("Nonaktif", { timeout: 30_000 });
  await staff.goto("/admin");
  await expect(staff).toHaveURL(/\/masuk/, { timeout: 60_000 });
  await staffContext.close();
});
