import { expect, test } from "@playwright/test";
import { E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { isiPasienBaru, uniqueNik } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

// Satu pasien dipakai berurutan oleh tiga uji; desktop dan ponsel dijalankan sebagai putaran terpisah.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const suffix = Date.now().toString().slice(-6);
const NIK = uniqueNik();
const NAME = `Pasien Panel ${suffix}`;
const WA = `0813${suffix}77`;

test("resepsionis mendaftarkan pasien lengkap lalu datanya tampil di halaman detail", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/pasien");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();

  const dialog = await isiPasienBaru(page, { name: NAME, whatsapp: WA, nik: NIK });
  await dialog.getByLabel("Email (opsional)").fill("Panel.E2E@Example.com");
  await dialog.getByLabel("Status pernikahan (opsional)").selectOption("MENIKAH");
  await expect(dialog.getByText("NIK belum terdaftar.")).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByRole("dialog", { name: "Pasien baru" })).toBeHidden({ timeout: 30_000 });

  await page.goto(`/admin/pasien?q=${encodeURIComponent(NAME)}`);
  await page.getByRole("link", { name: NAME }).first().click();
  await expect(page.getByRole("heading", { name: NAME })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Email", { exact: true }).locator("..")).toContainText("panel.e2e@example.com");
  await expect(page.getByText("Kontak darurat", { exact: true }).locator("..")).toContainText("Budi Kontak · 6281200000099");
  await expect(page.getByText("Status pernikahan", { exact: true }).locator("..")).toContainText("Menikah");
  await expect(page.getByText("Alamat", { exact: true }).locator("..")).toContainText("Jl. Uji Coba 1, Manado");
});

test("NIK yang sama kedua kalinya menampilkan pasien tadi dan Simpan tidak bisa ditekan", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/pasien");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();

  const dialog = page.getByRole("dialog", { name: "Pasien baru" });
  await dialog.getByLabel("NIK (16 angka)").fill(NIK);
  const card = dialog.getByRole("alert").filter({ hasText: "NIK sudah terdaftar" });
  await expect(card).toContainText(NAME, { timeout: 30_000 });
  await expect(card).toContainText("01/01/1990");
  await expect(dialog.getByRole("button", { name: "Buat Pasien" })).toBeDisabled();
  await expect(card.getByRole("link", { name: "Buka data pasien" })).toBeVisible();
});

test("'Pakai pasien ini' dari pemilih pasien di Booking baru memilih pasien yang sudah ada", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/booking/baru");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();

  const dialog = page.getByRole("dialog", { name: "Pasien baru" });
  await dialog.getByLabel("NIK (16 angka)").fill(NIK);
  await dialog.getByRole("button", { name: "Pakai pasien ini" }).click({ timeout: 30_000 });
  await expect(page.getByRole("dialog", { name: "Pasien baru" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(NAME).first()).toBeVisible();
});
