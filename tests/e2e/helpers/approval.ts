import { expect, type Page } from "@playwright/test";
import { E2E_APPROVAL_PIN, E2E_KEUANGAN } from "../credentials";

/** Mengisi kotak Persetujuan (spec PIN P7): pilih penyetuju, ketik PIN, Setujui. */
export async function setujui(page: Page, approver = E2E_KEUANGAN.name, pin = E2E_APPROVAL_PIN): Promise<void> {
  const dialog = page.getByRole("dialog", { name: "Persetujuan" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const select = dialog.getByLabel("Penyetuju");
  await expect(select.locator("option", { hasText: approver })).toHaveCount(1, { timeout: 30_000 });
  await select.selectOption({ label: approver });
  await dialog.getByLabel("PIN").fill(pin);
  await dialog.getByRole("button", { name: "Setujui" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
}
