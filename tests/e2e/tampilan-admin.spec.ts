import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { ADMIN_PAGES, resolveAdminPage } from "./helpers/admin-pages";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

test.setTimeout(180_000);

// Satu judul besar per halaman (spec D 3.1): bar atas tidak lagi memakai <h1>.
const PAGES: [string, RegExp][] = [
  ["/admin", /^Selamat (pagi|siang|sore|malam), /],
  ["/admin/booking", /^Booking$/],
  ["/admin/booking/baru", /^Booking Baru$/],
  ["/admin/pengingat", /^Pengingat$/],
  ["/admin/pasien", /^Pasien$/],
  ["/admin/jadwal", /^Jadwal$/],
  ["/admin/layanan", /^Layanan & Harga$/],
  ["/admin/staf", /^Staf$/],
  ["/admin/pengaturan", /^Pengaturan$/],
];

test("setiap halaman admin punya tepat satu judul besar, tanpa gulir mendatar di ponsel", async ({ page }, testInfo) => {
  await signIn(page, E2E_ADMIN);
  for (const [path, title] of PAGES) {
    await page.goto(path);
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1, { timeout: 30_000 });
    await expect(headings).toHaveText(title);
    if (testInfo.project.name === "mobile") {
      // Spec D 3.3: tabel boleh digulir di dalam kartunya, halaman tidak.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} melebar ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
});

test("judul dialog di mode gelap memakai warna teks tema, bukan warna judul situs publik", async ({ page }) => {
  // Dialog MUI dirender di luar akar panel (portal), jadi aturan judul situs publik harus dikembalikan di sana juga.
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("group", { name: "Mode tampilan" }).getByRole("button", { name: "Gelap" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-dark", "");
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const title = page.getByRole("dialog", { name: "Penjualan langsung" }).getByRole("heading", { name: "Penjualan langsung" });
  await expect(title).toHaveCSS("color", "rgb(247, 237, 212)"); // DARK.text #f7edd4
});

test("jadwal: buka hari Minggu untuk terapis, simpan, lalu tutup lagi", async ({ page }, testInfo) => {
  // Satu proyek saja: kedua proyek berbagi jadwal terapis yang sama.
  test.skip(testInfo.project.name === "mobile", "Hanya di desktop.");
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/jadwal");
  const therapist = page.getByRole("navigation", { name: "Pilih tenaga" }).getByRole("link", { name: /Terapis/ });
  await therapist.click();
  // Tunggu halaman terapis benar-benar terbuka: tab "Jam kerja" sudah aktif di halaman dokter sebelumnya.
  await expect(therapist).toHaveAttribute("aria-current", "page", { timeout: 30_000 });
  await expect(page.getByRole("link", { name: "Jam kerja" })).toHaveAttribute("aria-current", "page");

  const sunday = page.getByRole("checkbox", { name: "Buka hari Minggu" });
  await sunday.check();
  await page.getByLabel("Mulai Minggu").fill("10:00");
  await page.getByLabel("Selesai Minggu").fill("12:00");
  await page.getByRole("button", { name: "Simpan jam kerja" }).click();
  await expect(page.getByText("Jam kerja tersimpan.")).toBeVisible({ timeout: 30_000 });

  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Buka hari Minggu" })).toBeChecked({ timeout: 30_000 });
  await expect(page.getByLabel("Selesai Minggu")).toHaveValue("12:00");

  await page.getByRole("checkbox", { name: "Buka hari Minggu" }).uncheck();
  await page.getByRole("button", { name: "Simpan jam kerja" }).click();
  await expect(page.getByText("Jam kerja tersimpan.").first()).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "Buka hari Minggu" })).not.toBeChecked({ timeout: 30_000 });
});

test("Layanan & Harga: ubah harga, tampil di situs publik, lalu kembalikan", async ({ page }, testInfo) => {
  // Setiap proyek memakai layanan sendiri, agar tidak saling menimpa.
  const service =
    testInfo.project.name === "mobile"
      ? { name: "Elektrocauter", slug: "elektrocauter", price: 188000, changed: 187000, label: "Rp 187.000" }
      : { name: "Lip Laser", slug: "lip-laser", price: 99000, changed: 98000, label: "Rp 98.000" };
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/layanan");
  const promo = page.getByRole("textbox", { name: `Harga berlaku ${service.name}` });
  await promo.fill(String(service.changed));
  await page.getByRole("row", { name: new RegExp(service.name) }).getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`Harga ${service.name} tersimpan.`)).toBeVisible({ timeout: 30_000 });

  await page.goto(`/layanan/${service.slug}`);
  await expect(page.locator("main")).toContainText(service.label, { timeout: 30_000 });

  await page.goto("/admin/layanan");
  await page.getByRole("textbox", { name: `Harga berlaku ${service.name}` }).fill(String(service.price));
  await page.getByRole("row", { name: new RegExp(service.name) }).getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(`Harga ${service.name} tersimpan.`)).toBeVisible({ timeout: 30_000 });
});

test("Data Pasien: tab Booking lalu + Booking membuka Booking Baru dengan pasien terpilih", async ({ page }, testInfo) => {
  const name = testInfo.project.name === "mobile" ? "Pasien Kunjungan mobile" : "Pasien Kunjungan desktop";
  await signIn(page, E2E_ADMIN);
  await page.goto(`/admin/pasien?q=${encodeURIComponent(name)}`);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name, { timeout: 30_000 });

  await page.getByRole("link", { name: /^Booking \(\d+\)$/ }).click();
  await expect(page.getByRole("region", { name: "Riwayat booking" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "+ Booking" }).click();
  await expect(page).toHaveURL(/\/admin\/booking\/baru\?pasien=/, { timeout: 30_000 });
  await expect(page.getByRole("complementary", { name: "Ringkasan booking" })).toContainText(name);
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible();
});

test("semua halaman admin terbuka tanpa galat di skema terang dan gelap, tanpa gulir mendatar di ponsel", async ({ page }, testInfo) => {
  test.setTimeout(900_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  page.on("console", (message) => message.type() === "error" && errors.push(`${page.url()}: ${message.text()}`));
  await signIn(page, E2E_ADMIN);
  const missing: string[] = [];
  for (const scheme of ["light", "dark"] as const) {
    await page.evaluate((value) => localStorage.setItem("sundy-mode-admin", value), scheme);
    for (const target of ADMIN_PAGES) {
      const href = await resolveAdminPage(page, target);
      if (!href) {
        missing.push(`${scheme} ${target.path}`);
        continue;
      }
      await page.goto(href);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1, { timeout: 30_000 });
      await expect(page.locator("html")).toHaveAttribute(`data-${scheme}`, "");
      if (testInfo.project.name === "mobile") {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${href} (${scheme}) melebar ${overflow}px`).toBeLessThanOrEqual(1);
      }
    }
  }
  // Halaman detail tanpa data contoh dilewati di sini; pemeriksaan lengkapnya ada di Step 6 (foto, dengan data).
  testInfo.annotations.push({ type: "halaman detail tanpa data", description: missing.join("; ") || "-" });
  expect(errors).toEqual([]);
});
