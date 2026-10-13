import { expect, test, type TestInfo } from "@playwright/test";
import sharp from "sharp";
import { E2E_ADMIN, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

// Satu cerita berurutan per proyek (spec layanan situs 8): Admin Keuangan menambah item khusus internal → Super Admin membuat
// layanan situs bertautan dengan foto → Resepsionis menagihkan item itu dari katalog.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const tag = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? "M" : "D");
const stamp = Date.now().toString().slice(-6);
const internalName = (t: string) => `Add-on E2E ${t} ${stamp}`;
const siteName = (t: string) => `Promo Add-on E2E ${t} ${stamp}`;
const siteSlug = (t: string) => `promo-add-on-e2e-${t.toLowerCase()}-${stamp}`;

test("Admin Keuangan menambah layanan khusus internal yang tidak tampil di situs", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/layanan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Layanan internal" }).click();
  const dialog = page.getByRole("dialog", { name: "Tambah layanan internal" });
  await dialog.getByLabel("Nama").fill(internalName(t));
  await dialog.getByLabel("Kategori").selectOption({ label: "Facial Treatment" });
  await dialog.getByLabel("Harga berlaku").fill("75000");
  await dialog.getByLabel("Durasi (menit)").fill("30");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("row", { name: new RegExp(internalName(t)) })).toContainText("Hanya internal", { timeout: 30_000 });

  await page.goto("/layanan");
  await expect(page.locator("main")).not.toContainText(internalName(t));
});

test("Super Admin membuat layanan situs bertautan dengan foto; tampil di /layanan dengan harga internal", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#c8a97e" } }).png().toBuffer();
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/layanan?tab=situs");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Layanan situs" }).click();
  const add = page.getByRole("dialog", { name: "Tambah layanan situs" });
  await pilihOpsi(add, "Layanan internal", `${internalName(t)} — Rp 75.000`);
  await add.getByLabel("Nama di situs").fill(siteName(t));
  await expect(add.getByLabel("Alamat (slug)")).toHaveValue(siteSlug(t));
  await add.getByRole("button", { name: "Simpan" }).click();
  await expect(add).toBeHidden({ timeout: 30_000 });

  await page.getByRole("button", { name: `Ubah ${siteName(t)}` }).click();
  const edit = page.getByRole("dialog", { name: `Ubah — ${siteName(t)}` });
  await edit.getByLabel("Berkas foto layanan").setInputFiles({ name: "layanan.png", mimeType: "image/png", buffer: photo });
  await expect(edit.getByRole("img", { name: "Pratinjau foto baru" })).toBeVisible();
  await edit.getByRole("button", { name: "Pakai foto ini" }).click();
  await expect(page.getByText("Foto diganti dan sudah tampil di situs.")).toBeVisible({ timeout: 30_000 });
  await edit.getByRole("button", { name: "Simpan" }).click();
  await expect(edit).toBeHidden({ timeout: 30_000 });

  await page.goto(`/layanan/${siteSlug(t)}`);
  await expect(page.getByRole("heading", { level: 1, name: siteName(t) })).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("main")).toContainText("Rp 75.000");
  const hero = page.getByRole("img", { name: siteName(t) }).first();
  await expect.poll(() => hero.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const src = (await hero.getAttribute("src")) ?? "";
  expect(decodeURIComponent(new URL(src, "http://localhost").searchParams.get("url") ?? src)).toMatch(/^\/foto-layanan\/[0-9a-z]+-[0-9a-f]{8}\.webp$/);
});

test("Resepsionis menagihkan item khusus internal dari katalog dan memilih pelaksana", async ({ page }, testInfo) => {
  const t = tag(testInfo);
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const sale = page.getByRole("dialog", { name: "Penjualan langsung" });
  await sale.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(page, { name: `Pelanggan Katalog ${t} ${stamp}`, whatsapp: `0813${Date.now().toString().slice(-8)}` });
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });

  await page.getByRole("button", { name: "+ Baris layanan" }).click();
  const line = page.getByRole("dialog", { name: "Tambah baris layanan" });
  await pilihOpsi(line, "Layanan", `${internalName(t)} — Rp 75.000`);
  await expect(line.getByLabel("Harga")).toBeDisabled();
  await line.getByRole("button", { name: "Tambah" }).click();
  await expect(line).toBeHidden({ timeout: 30_000 });

  const performer = page.getByLabel(`Pelaksana ${internalName(t)}`);
  await expect(performer).toBeVisible({ timeout: 30_000 });
  await performer.selectOption({ label: "Terapis SunDY Mahakeret" });
  await expect(performer).not.toHaveValue("", { timeout: 30_000 });
});
