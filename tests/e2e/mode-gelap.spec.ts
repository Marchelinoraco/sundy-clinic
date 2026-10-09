import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Kompilasi pertama halaman di server dev bisa lebih dari 30 detik (batas bawaan).
test.setTimeout(120_000);

// Spec MUI 5: Terang / Gelap / Ikuti sistem, diingat per perangkat, tanpa kedip, cetak terang, situs publik tetap.

const DARK_BACKGROUND = "rgb(20, 16, 10)"; // DARK.background #14100a

test("mode tampilan: pilihan, bertahan setelah muat ulang, tanpa kedip, cetak terang, halaman masuk", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/laporan");
  await tungguHidrasi(page);
  const html = page.locator("html");
  const mode = page.getByRole("group", { name: "Mode tampilan" });

  await mode.getByRole("button", { name: "Gelap" }).click();
  await expect(html).toHaveAttribute("data-dark", "");
  await expect(mode.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".MuiScopedCssBaseline-root")).toHaveCSS("background-color", DARK_BACKGROUND);

  // Skema sudah terpasang sebelum React berjalan: tidak ada kedip terang.
  await page.reload({ waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => document.documentElement.hasAttribute("data-dark"))).toBe(true);
  await expect(mode.getByRole("button", { name: "Gelap" })).toHaveAttribute("aria-pressed", "true");

  // Cetak selalu terang.
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(0, 0, 0)");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.emulateMedia({ media: "screen" });

  // Ikuti sistem: mengikuti pengaturan perangkat dan perubahannya.
  await mode.getByRole("button", { name: "Ikuti sistem" }).click();
  await expect(html).toHaveAttribute("data-light", "");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(html).toHaveAttribute("data-dark", "");

  // Terang mengalahkan pengaturan perangkat.
  await mode.getByRole("button", { name: "Terang" }).click();
  await expect(html).toHaveAttribute("data-light", "");

  // Halaman masuk ikut pilihan yang tersimpan di perangkat.
  await mode.getByRole("button", { name: "Gelap" }).click();
  await page.context().clearCookies();
  await page.goto("/masuk");
  await expect(page.getByRole("heading", { level: 1, name: "Panel Admin" })).toBeVisible({ timeout: 30_000 });
  await expect(html).toHaveAttribute("data-dark", "");
});

test("situs publik tetap terang walau perangkat gelap dan atribut skema admin tertinggal", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  const body = page.locator("body");
  const before = await body.evaluate((el) => getComputedStyle(el).backgroundColor);
  await page.evaluate(() => document.documentElement.setAttribute("data-dark", ""));
  await expect(body).toHaveCSS("background-color", before);
  expect(before).not.toBe(DARK_BACKGROUND);
});
