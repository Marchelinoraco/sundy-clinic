import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Booking dan catatan draf dari prepare-db.mts, satu per proyek agar desktop dan ponsel tidak berebut.
test.setTimeout(180_000);

const code = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "E2E-BIA-2" : "E2E-BIA-1");
// PNG 1×1 piksel yang sah.
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4f30000000049454e44ae426082",
  "hex",
);

test("resepsionis mengunggah hasil BIA dari daftar booking; dokter membuka, mengisi angka, dan melihat grafik", async ({ page, browser }, testInfo) => {
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/booking");
  await tungguHidrasi(page);
  const row = page.getByRole("row").filter({ hasText: code(testInfo) });
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Unggah hasil BIA" }).click();
  const dialog = page.getByRole("dialog", { name: `Hasil BIA — ${code(testInfo)}` });
  await expect(dialog.getByText("Belum ada berkas BIA untuk booking ini.")).toBeVisible({ timeout: 30_000 });

  await dialog.getByLabel("Berkas hasil BIA").setInputFiles({ name: "hasil-bia.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.getByText("hasil-bia.png: terunggah")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("listitem", { name: "hasil-bia.png" })).toBeVisible();

  // Berkas palsu bernama .jpg ditolak dari isinya.
  await dialog.getByLabel("Berkas hasil BIA").setInputFiles({ name: "palsu.jpg", mimeType: "image/jpeg", buffer: Buffer.from("<script>alert(1)</script>") });
  await expect(dialog.getByText(/palsu\.jpg: Jenis berkas tidak didukung/)).toBeVisible({ timeout: 30_000 });
  // Resepsionis tidak mendapat tautan ke berkas.
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Tutup" }).click();
  await expect(row).toContainText("BIA terunggah: 1 berkas", { timeout: 30_000 });

  // Resepsionis tidak bisa membuka halaman kunjungan (tempat berkas dibuka).
  const forbidden = await page.request.get(`/admin/kunjungan/e2e-bia-${testInfo.project.name}`);
  expect(forbidden.status()).toBe(403);

  // Dokter (Super Admin, sesi sendiri, ukuran layar proyek yang sama).
  const doctorContext = await browser.newContext({ ...testInfo.project.use, baseURL: E2E_BASE_URL });
  const doctor = await doctorContext.newPage();
  await signIn(doctor, E2E_ADMIN);
  await doctor.goto(`/admin/kunjungan/e2e-bia-${testInfo.project.name}`);
  await tungguHidrasi(doctor);
  await doctor.getByRole("tab", { name: "BIA" }).click();
  const panel = doctor.getByRole("tabpanel", { name: "BIA" });
  await expect(panel.getByText("hasil-bia.png")).toBeVisible();

  await panel.getByRole("button", { name: "Buka hasil-bia.png" }).click();
  const preview = doctor.getByRole("dialog", { name: "hasil-bia.png" });
  const image = preview.getByRole("img", { name: "Hasil BIA hasil-bia.png" });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  await preview.getByRole("button", { name: "Tutup" }).click();

  await panel.getByLabel("Lemak tubuh (%)").fill("28,5");
  await panel.getByLabel("Massa otot (kg)").fill("41");
  await panel.getByRole("button", { name: "Simpan angka BIA" }).click();
  await expect(doctor.getByText("Angka BIA tersimpan.")).toBeVisible({ timeout: 30_000 });

  await doctor.reload();
  await tungguHidrasi(doctor);
  await doctor.getByRole("tab", { name: "BIA" }).click();
  await expect(doctor.getByRole("tabpanel", { name: "BIA" }).getByLabel("Lemak tubuh (%)")).toHaveValue("28,5");
  await doctor.getByRole("tab", { name: "Tren" }).click();
  await expect(doctor.getByRole("img", { name: "Grafik komposisi tubuh" })).toBeVisible();

  // Tidak ada gulir mendatar halaman (terutama di ponsel).
  const overflow = await doctor.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await doctorContext.close();
});
