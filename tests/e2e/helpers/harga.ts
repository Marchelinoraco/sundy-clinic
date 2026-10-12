import { expect, type Browser } from "@playwright/test";
import { E2E_KEUANGAN } from "../credentials";
import { E2E_BASE_URL } from "../test-env";
import { tungguHidrasi } from "./mui";
import { signIn } from "./quiz";

/** Harga jual (dan promo opsional) diisi Admin Keuangan di konteks terpisah (spec perbaikan tagihan T9). */
export async function aturHargaJual(browser: Browser, itemName: string, price: string, promo?: { name: string; percent: string }): Promise<void> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();
  await signIn(page, E2E_KEUANGAN);
  await page.goto(`/admin/stok?cari=${encodeURIComponent(itemName)}`);
  await tungguHidrasi(page);
  await page.getByRole("link", { name: itemName, exact: true }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: "Harga & promo" }).click();
  const dialog = page.getByRole("dialog", { name: `Harga & promo ${itemName}` });
  await dialog.getByLabel("Harga jual").fill(price);
  if (promo) {
    await dialog.getByLabel("Promo").selectOption("PERSEN");
    await dialog.getByLabel("Nama promo").fill(promo.name);
    await dialog.getByLabel("Persen promo").fill(promo.percent);
  }
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await context.close();
}
