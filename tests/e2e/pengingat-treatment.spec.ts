import { expect, test, type Locator, type Page } from "@playwright/test";
import { E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Pengingat treatment (spec pengingat treatment): pasien yang treatment Relaxing Facial 7 hari lalu (prepare-db.mts) muncul di
// kotak 5, resepsionis mengirim WA, tab Pasien treatment mencatat kirimannya, dan Admin Keuangan mengatur jarak layanan.
test.setTimeout(150_000);

async function clickAndClosePopup(page: Page, link: Locator) {
  await page.context().route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
  const popup = page.waitForEvent("popup");
  await link.click();
  await (await popup).close();
}

test("resepsionis mengajak pasien treatment kembali; Admin Keuangan mengatur jarak pengingat", async ({ page, browser }, testInfo) => {
  const name = `Pasien Treatment ${testInfo.project.name === "mobile" ? "mobile" : "desktop"}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/pengingat");
  await tungguHidrasi(page);

  // Kotak 5: treatment, jarak, dan pesan yang menyebut "setiap minggu" (PT6, PT11).
  const row = page.getByRole("region", { name: /5 · Waktunya treatment lagi — ajak kembali/ }).getByRole("listitem").filter({ hasText: name });
  await expect(row).toContainText("Relaxing Facial", { timeout: 30_000 });
  await expect(row).toContainText("tiap 1 minggu");
  const send = row.getByRole("link", { name: "Kirim" });
  await expect(send).toHaveAttribute("href", /^https:\/\/wa\.me\/628.*setiap%20minggu/);
  await clickAndClosePopup(page, send);
  await expect(row).toContainText("Sudah diingatkan", { timeout: 30_000 });
  await expect(row).toContainText("oleh Resepsionis E2E");

  // Tab Pasien treatment: kiriman tercatat dan bisa dikirim lagi (PT10, PT12).
  await page.getByRole("link", { name: "Pasien treatment" }).click();
  await expect(page).toHaveURL(/tab=pasien-treatment/);
  await page.getByLabel("Cari nama pasien atau treatment").fill(name);
  await page.getByRole("button", { name: "Cari" }).click();
  const patientRow = page.getByRole("table", { name: "Pasien treatment" }).getByRole("row").filter({ hasText: name });
  await expect(patientRow).toContainText("Resepsionis E2E", { timeout: 30_000 });
  await expect(patientRow.getByRole("link", { name: "Kirim lagi" })).toHaveAttribute("href", /wa\.me/);

  // Admin Keuangan: jarak pengingat per layanan tersimpan (PT2).
  const finance = await browser.newContext({ baseURL: E2E_BASE_URL });
  const fp = await finance.newPage();
  await signIn(fp, E2E_KEUANGAN);
  await fp.goto("/admin/layanan");
  await tungguHidrasi(fp);
  await fp.getByLabel("Ingatkan kembali Facial Acne").selectOption("14");
  await expect(fp.getByText("Facial Acne: 2 minggu.")).toBeVisible({ timeout: 30_000 });
  await fp.reload();
  await tungguHidrasi(fp);
  await expect(fp.getByLabel("Ingatkan kembali Facial Acne")).toHaveValue("14");
  await finance.close();
});
