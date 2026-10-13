import { expect, test } from "@playwright/test";
import { E2E_RESEPSIONIS } from "./credentials";
import { pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

test.setTimeout(180_000);

test("resepsionis mengirim struk via WA; tautan terbuka tanpa login; Ganti tautan mematikannya; cetak tanpa QZ Tray memberi pesan jelas", async ({ page, browser }, testInfo) => {
  const suffix = `${testInfo.project.name === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const saleDialog = page.getByRole("dialog", { name: "Penjualan langsung" });
  await saleDialog.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(page, { name: `Pelanggan Struk ${suffix}`, whatsapp: `0813${Date.now().toString().slice(-8)}` });
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });

  await page.getByRole("button", { name: "+ Baris layanan" }).click();
  const lineDialog = page.getByRole("dialog", { name: "Tambah baris layanan" });
  await pilihOpsi(lineDialog, "Layanan", "Lainnya (ketik sendiri)");
  await lineDialog.getByLabel("Nama", { exact: true }).fill(`Layanan Struk ${suffix}`);
  await lineDialog.getByLabel("Harga").fill("250000");
  await lineDialog.getByRole("button", { name: "Tambah" }).click();
  await expect(lineDialog).toBeHidden({ timeout: 30_000 });
  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: "Kirim struk via WA" }).click();
  const sendDialog = page.getByRole("dialog", { name: "Kirim struk" });
  const open = sendDialog.getByRole("link", { name: "Buka WhatsApp" });
  await expect(open).toHaveAttribute("href", /^https:\/\/wa\.me\/62\d+\?text=/, { timeout: 30_000 });
  const text = decodeURIComponent(new URL((await open.getAttribute("href"))!).searchParams.get("text")!);
  expect(text).toContain("Total: Rp 250.000 (sisa Rp 250.000)");
  const receiptUrl = /(https?:\/\/\S+\/struk#\S+)/.exec(text)![1];
  await sendDialog.getByRole("button", { name: "Close" }).click();

  const visitor = await browser.newContext();
  const guest = await visitor.newPage();
  await guest.goto(receiptUrl);
  const paper = guest.getByRole("region", { name: /^Struk TG-\d{4}-\d{4}$/ });
  await expect(paper).toContainText(`Layanan Struk ${suffix}`, { timeout: 30_000 });
  await expect(paper).toContainText("Rp 250.000");
  await expect(paper).toContainText("BELUM DIBAYAR");
  await guest.emulateMedia({ media: "print" });
  await expect(guest.getByRole("button", { name: "Cetak" })).toBeHidden();
  await guest.emulateMedia({ media: "screen" });

  await page.getByRole("button", { name: "Ganti tautan" }).click();
  await page.getByRole("dialog", { name: "Ganti tautan struk?" }).getByRole("button", { name: "Ganti" }).click();
  await expect(page.getByText("Tautan struk diganti. Kirim ulang struk bila perlu.")).toBeVisible({ timeout: 30_000 });
  await guest.reload();
  await expect(guest.getByText("Tautan struk tidak berlaku.")).toBeVisible({ timeout: 30_000 });
  await visitor.close();

  // Komputer uji tidak menjalankan QZ Tray: dialog pengaturan menyebutnya dengan jelas.
  await page.getByRole("button", { name: "Cetak struk" }).click();
  const settings = page.getByRole("dialog", { name: "Pengaturan printer struk" });
  await expect(settings.getByText("QZ Tray tidak tersambung. Buka QZ Tray di komputer ini lalu coba lagi.")).toBeVisible({ timeout: 60_000 });
});
