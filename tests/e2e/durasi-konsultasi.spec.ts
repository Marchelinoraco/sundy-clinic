import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Lama konsultasi berlaku untuk semua uji yang memakai basis data yang sama: satu proyek saja,
// berurutan, dan selalu dikembalikan ke 30 menit (prepare-db juga menyetelnya ulang).
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function setConsultationMinutes(page: Page, minutes: number) {
  await page.goto("/admin/layanan");
  await tungguHidrasi(page);
  const card = page.getByRole("region", { name: "Konsultasi di klinik" });
  await card.getByLabel("Lama konsultasi").selectOption(String(minutes));
  await card.getByRole("button", { name: "Simpan" }).click();
  await expect(card).toContainText(`Lama konsultasi sekarang: ${minutes} menit`, { timeout: 30_000 });
}

test("lama konsultasi 15 menit dari Layanan & Harga: Booking Baru menawarkan jam tiap 15 menit", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Mengubah pengaturan bersama; cukup satu proyek.");
  await signIn(page, E2E_ADMIN);
  try {
    await setConsultationMinutes(page, 15);

    await page.goto("/admin/booking/baru");
    await tungguHidrasi(page);
    await expect(page.locator("#booking-staff option:checked")).toContainText("Diane");
    const strip = page.getByRole("group", { name: "Pilih tanggal" });
    await strip.getByRole("button", { name: /jam kosong/ }).first().click({ timeout: 30_000 });
    const slots = page.getByRole("group", { name: "Pilih jam" }).getByRole("button");
    await expect(slots.first()).toBeVisible({ timeout: 30_000 });
    const labels = await slots.allTextContents();
    expect(labels.some((label) => /\.(15|45)$/.test(label.trim()))).toBe(true);
  } finally {
    await setConsultationMinutes(page, 30);
  }
});
