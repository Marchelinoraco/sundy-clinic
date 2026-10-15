import { expect, type Browser } from "@playwright/test";
import { E2E_APOTEKER } from "../credentials";
import { E2E_BASE_URL } from "../test-env";
import { tungguHidrasi } from "./mui";
import { signIn } from "./quiz";

/** Apoteker mengisi meja dari gudang di konteks terpisah (spec stok meja 4.2): tagihan hanya mengambil stok meja. */
export async function isiMeja(browser: Browser, itemName: string, quantity: string): Promise<void> {
  const context = await browser.newContext({ baseURL: E2E_BASE_URL });
  const page = await context.newPage();
  await signIn(page, E2E_APOTEKER);
  await page.goto("/admin/stok-meja?tampil=semua");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: `Isi meja ${itemName}` }).click();
  const dialog = page.getByRole("dialog", { name: `Isi meja ${itemName}` });
  await dialog.getByLabel("Jumlah").fill(quantity);
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await context.close();
}
