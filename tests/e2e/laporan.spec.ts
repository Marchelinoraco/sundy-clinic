import { readFileSync } from "node:fs";
import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";
import { isiTanggal } from "./helpers/mui";

// Satu cerita berurutan per proyek (desktop/ponsel, data masing-masing):
// Admin Keuangan mengelola kategori, mencatat dan membatalkan pengeluaran, membuat dan mengubah pengeluaran
// berulang → membuka laporan dan mengunduh CSV → peran lain ditolak.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");

test("kategori, pengeluaran, dan pembatalan", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_KEUANGAN);
  await expect(page.getByRole("region", { name: "Laporan", exact: true }).getByRole("link", { name: /bersih bulan ini/ })).toBeVisible();

  await page.goto("/admin/pengeluaran?tab=kategori");
  await page.getByLabel("Nama kategori baru").fill(`E2E Kategori ${t}`);
  await page.getByRole("button", { name: "Tambah kategori" }).click();
  await expect(page.getByText(`E2E Kategori ${t}`, { exact: true })).toBeVisible({ timeout: 30_000 });

  await page.goto("/admin/pengeluaran");
  await page.getByRole("button", { name: "+ Pengeluaran" }).click();
  const dialog = page.getByRole("dialog", { name: "Catat pengeluaran" });
  await dialog.getByLabel("Kategori").selectOption({ label: "Sewa" });
  await dialog.getByLabel("Nominal").fill(t === "M" ? "700000" : "500000");
  await dialog.getByLabel("Keterangan (opsional)").fill(`Sewa E2E ${t}`);
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row").filter({ hasText: `Sewa E2E ${t}` })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "+ Pengeluaran" }).click();
  await dialog.getByLabel("Kategori").selectOption({ label: `E2E Kategori ${t}` });
  await dialog.getByLabel("Nominal").fill("123000");
  await dialog.getByLabel("Keterangan (opsional)").fill(`Salah catat E2E ${t}`);
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const wrong = page.getByRole("row").filter({ hasText: `Salah catat E2E ${t}` });
  await expect(wrong).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: `Batalkan E2E Kategori ${t} Rp 123.000` }).click();
  const voidDialog = page.getByRole("dialog", { name: "Batalkan pengeluaran?" });
  await voidDialog.getByLabel("Alasan").fill("Salah catat nominal");
  await voidDialog.getByRole("button", { name: "Batalkan pengeluaran" }).click();
  await expect(voidDialog).toBeHidden({ timeout: 30_000 });
  await expect(wrong).toContainText("Dibatalkan oleh", { timeout: 30_000 });
  await expect(wrong).toContainText("Salah catat nominal");

  // Pindah bulan lewat tautan: isian Bulan di penyaring ikut berganti ke bulan yang ditampilkan.
  const monthInput = page.getByRole("group", { name: "Bulan", exact: true }).locator("input");
  const [mm, yyyy] = (await monthInput.inputValue()).split("/").map(Number);
  const previous = mm === 1 ? `12/${yyyy - 1}` : `${String(mm - 1).padStart(2, "0")}/${yyyy}`;
  await page.getByRole("navigation", { name: "Pindah bulan" }).getByRole("link", { name: "← Bulan sebelumnya" }).click();
  await expect(page).toHaveURL(/bulan=\d{4}-\d{2}/, { timeout: 30_000 });
  await expect(monthInput).toHaveValue(previous, { timeout: 30_000 });
});

test("pengeluaran berulang: dibuat, muncul bulan ini, dan perubahan tidak mengubah catatan lama", async ({ page }, testInfo) => {
  // Keterangan per proyek: desktop dan ponsel bisa berjalan dalam satu putaran dengan data bersama,
  // dan keduanya membuat templat Gaji tanggal 25.
  const note = `Gaji E2E ${tag(testInfo)}`;
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/pengeluaran?tab=berulang");
  await page.getByRole("button", { name: "+ Berulang" }).click();
  const dialog = page.getByRole("dialog", { name: "Pengeluaran berulang" });
  await dialog.getByLabel("Kategori").selectOption({ label: "Gaji" });
  await dialog.getByLabel("Nominal").fill("1000000");
  await dialog.getByLabel("Tanggal tiap bulan").fill("25");
  await dialog.getByLabel("Keterangan (opsional)").fill(note);
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  const template = page.getByRole("row").filter({ hasText: note });
  await expect(template).toContainText("Tiap tanggal 25", { timeout: 30_000 });

  await page.goto("/admin/pengeluaran");
  const generated = page.getByRole("row").filter({ hasText: note }).filter({ hasText: "Berulang" });
  await expect(generated).toContainText("Rp 1.000.000", { timeout: 30_000 });

  await page.goto("/admin/pengeluaran?tab=berulang");
  await template.getByRole("button", { name: "Ubah Gaji" }).click();
  const edit = page.getByRole("dialog", { name: "Ubah pengeluaran berulang" });
  await edit.getByLabel("Nominal").fill("1200000");
  await edit.getByRole("button", { name: "Simpan" }).click();
  await expect(edit).toBeHidden({ timeout: 30_000 });
  await expect(template).toContainText("Rp 1.200.000", { timeout: 30_000 });

  await page.goto("/admin/pengeluaran");
  await expect(generated).toContainText("Rp 1.000.000");
});

test("laporan: ringkasan, rincian tanpa pengeluaran yang dibatalkan, periode, dan rentang tidak sah", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/laporan");
  await expect(page.getByRole("region", { name: "Ringkasan laporan" })).toBeVisible({ timeout: 30_000 });
  const table = page.getByRole("table", { name: "Rincian laporan" });
  await expect(table.getByRole("row").filter({ hasText: /^Sewa/ })).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: /^Gaji/ })).toBeVisible();
  await expect(table).not.toContainText(`E2E Kategori ${t}`);
  await expect(page.getByRole("img", { name: "Grafik tren 12 bulan" })).toBeVisible();

  await page.getByLabel("Periode").selectOption("TAHUN_INI");
  await page.getByRole("button", { name: "Tampilkan" }).click();
  await expect(page).toHaveURL(/periode=TAHUN_INI/, { timeout: 30_000 });
  await isiTanggal(page, "Dari tanggal", "2026-10-02");
  await expect(page.getByLabel("Periode")).toHaveValue("RENTANG");
  await page.getByRole("button", { name: "Tampilkan" }).click();
  await expect(page).toHaveURL(/periode=RENTANG&dari=2026-10-02&sampai=/, { timeout: 30_000 });

  await page.goto("/admin/laporan?periode=RENTANG&dari=2026-10-10&sampai=2026-10-01");
  await expect(page.getByRole("alert").filter({ hasText: "Tanggal dari tidak boleh setelah tanggal sampai." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ringkasan laporan" })).toBeVisible();
});

test("unduh CSV laporan", async ({ page }) => {
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/laporan");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Unduh CSV" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^laporan-untung-rugi-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = readFileSync(await download.path(), "utf8");
  expect(csv.startsWith("﻿")).toBe(true);
  expect(csv).toContain("Laporan untung-rugi");
  expect(csv).toContain("Sewa,");
  expect(csv).toContain("Gaji,");
});

test("hak akses: resepsionis dan apoteker ditolak", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  expect((await page.goto("/admin/pengeluaran"))?.status()).toBe(403);
  expect((await page.goto("/admin/laporan"))?.status()).toBe(403);
  expect((await page.request.get("/admin/laporan/unduh?dari=2026-01-01&sampai=2026-01-31")).status()).toBe(403);
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Laporan", exact: true })).toHaveCount(0);

  await page.context().clearCookies();
  await signIn(page, E2E_APOTEKER);
  expect((await page.goto("/admin/laporan"))?.status()).toBe(403);
});
