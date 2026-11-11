import { expect, test, type Locator } from "@playwright/test";
import { E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { isiTanggal, tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Paket lama dari Kluto (spec docs/superpowers/specs/2026-11-11-paket-lama-kluto-design.md; rencana Task 8).
test.setTimeout(240_000);

async function pilihMemuat(select: Locator, text: string) {
  await select.selectOption((await select.locator("option", { hasText: text }).first().getAttribute("value")) ?? "");
}

test("resepsionis memasukkan paket lama, sesinya dipakai di tagihan, Admin Keuangan mengoreksi dan membatalkan", async ({ page, browser }, testInfo) => {
  const project = testInfo.project.name === "mobile" ? "mobile" : "desktop";
  const t = `${project === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  const packageName = `Paket E2E Lama ${t}`;
  const patientName = `Pasien Kluto ${t}`;
  const whatsapp = `0813${Date.now().toString().slice(-8)}`;

  // Admin Keuangan membuat paket katalog yang sama dengan di Kluto.
  await signIn(page, E2E_KEUANGAN);
  await page.goto("/admin/paket?tab=katalog");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Paket" }).click();
  const create = page.getByRole("dialog", { name: "Tambah paket" });
  await create.getByLabel("Nama paket").fill(packageName);
  await create.getByLabel("Harga paket").fill("400000");
  await create.getByLabel("Masa berlaku (hari)").fill("90");
  await pilihMemuat(create.getByLabel("Layanan 1"), "Relaxing Facial");
  await create.getByLabel("Jumlah sesi 1").fill("3");
  await create.getByRole("button", { name: "Simpan" }).click();
  await expect(create).toBeHidden({ timeout: 30_000 });

  // Pasien ini sudah pernah terdaftar (mis. lewat situs), tetapi resepsionis mengira belum ada.
  const desk = await browser.newContext({ baseURL: E2E_BASE_URL });
  const rp = await desk.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/pasien");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(rp, { name: patientName, whatsapp });
  await expect(rp.getByRole("dialog", { name: "Pasien baru" })).toBeHidden({ timeout: 30_000 });

  // Dialog paket lama: WA yang sudah terdaftar menawarkan pasien yang ada (Review Focus 1).
  await rp.goto("/admin/paket");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: "+ Paket lama (Kluto)" }).click();
  const dialog = rp.getByRole("dialog", { name: "Paket lama (Kluto)" });
  await dialog.getByRole("checkbox", { name: "Pasien belum ada di SunDY" }).check();
  await dialog.getByLabel("Nama pasien").fill(patientName);
  await dialog.getByLabel("No. HP (WhatsApp)").fill(whatsapp);
  await dialog.getByLabel("NIK (opsional)").click();
  await expect(dialog.getByText(/Nomor ini sudah terdaftar/)).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Pakai pasien ini" }).click();
  await expect(dialog).toContainText(patientName);

  await pilihMemuat(dialog.getByLabel("Paket"), packageName);
  await isiTanggal(dialog, "Tanggal beli di Kluto", "2025-06-01");
  await dialog.getByLabel("Jumlah kunjungan di Kluto").fill("1");
  await expect(dialog.getByLabel("Sudah dipakai Relaxing Facial")).toHaveValue("1");
  await expect(dialog).toContainText("Sisa 2");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog.getByText(`Paket ${packageName} untuk ${patientName}`)).toBeVisible({ timeout: 30_000 });

  await dialog.getByRole("button", { name: "Close" }).click();

  // Sesinya dipakai di tagihan penjualan langsung dengan baris Relaxing Facial.
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const sale = rp.getByRole("dialog", { name: "Penjualan langsung" });
  await sale.getByRole("combobox", { name: /Cari pasien/ }).fill(patientName);
  await rp.getByRole("option", { name: new RegExp(patientName) }).click();
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await expect(rp.getByRole("alert", { name: "Paket customer" })).toContainText("paket lama Kluto", { timeout: 30_000 });
  await rp.getByRole("button", { name: "+ Baris layanan" }).click();
  const line = rp.getByRole("dialog", { name: "Tambah baris layanan" });
  await line.getByRole("combobox", { name: "Layanan", exact: true }).fill("Relaxing Facial");
  await rp.getByRole("option", { name: /^Relaxing Facial — Rp/ }).click();
  await line.getByRole("button", { name: "Tambah" }).click();
  await expect(line).toBeHidden({ timeout: 30_000 });
  await rp.getByRole("button", { name: "Pakai sesi paket Relaxing Facial" }).click();
  await expect(rp.getByText(`Sesi paket ${packageName} · sisa 1 dari 3`)).toBeVisible({ timeout: 30_000 });
  const performer = rp.getByLabel("Pelaksana Relaxing Facial");
  await performer.selectOption({ index: 1 });
  await expect(performer).not.toHaveValue("", { timeout: 30_000 });
  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  // Paket kedua untuk pasien yang sama, sengaja ganda: peringatan dulu, lalu nanti dibatalkan Admin Keuangan.
  await rp.goto("/admin/paket");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: "+ Paket lama (Kluto)" }).click();
  await dialog.getByRole("combobox", { name: /Cari pasien/ }).fill(patientName);
  await rp.getByRole("option", { name: new RegExp(patientName) }).click();
  await pilihMemuat(dialog.getByLabel("Paket"), packageName);
  await expect(dialog.getByText("Pasien ini sudah punya paket lama ini:")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: "Simpan" })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Ini paket yang berbeda" }).check();
  await isiTanggal(dialog, "Tanggal beli di Kluto", "2025-07-01");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog.getByRole("button", { name: "Tambah paket lama lain" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole("button", { name: "Close" }).click();

  // Saringan Paket lama memuat keduanya, tanpa batas waktu.
  await rp.goto(`/admin/paket?asal=kluto&cari=${encodeURIComponent(patientName)}`);
  await tungguHidrasi(rp);
  const table = rp.getByRole("table", { name: "Paket customer" });
  await expect(table).toContainText("Paket lama (Kluto)");
  await expect(table).toContainText("Tanpa batas waktu");
  await expect(table.getByRole("link", { name: packageName })).toHaveCount(2);
  await desk.close();

  // Admin Keuangan: paket yang dipakai dikoreksi, paket yang belum dipakai dibatalkan.
  await page.goto(`/admin/paket?asal=kluto&cari=${encodeURIComponent(patientName)}`);
  await tungguHidrasi(page);
  const links = page.getByRole("table", { name: "Paket customer" }).getByRole("link", { name: packageName });
  const urls = await Promise.all([0, 1].map(async (index) => (await links.nth(index).getAttribute("href")) ?? ""));
  let usedUrl = "";
  for (const url of urls) {
    await page.goto(url);
    await tungguHidrasi(page);
    await expect(page.getByRole("heading", { name: `${packageName} · Paket lama (Kluto)` })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Perpanjang" })).toHaveCount(0);
    if ((await page.getByRole("table", { name: "Riwayat paket" }).getByRole("link").count()) > 0) usedUrl = url;
  }
  expect(usedUrl).not.toBe("");
  const unusedUrl = urls.find((url) => url !== usedUrl)!;

  await page.goto(usedUrl);
  await tungguHidrasi(page);
  await expect(page.getByRole("table", { name: "Rencana kunjungan" })).toContainText("Ke-2");
  await page.getByRole("button", { name: "Koreksi sisa" }).click();
  const correct = page.getByRole("dialog", { name: "Koreksi sisa" });
  await correct.getByLabel("Sisa yang benar Relaxing Facial").fill("2");
  await correct.getByLabel("Alasan").fill("Salah hitung dari Kluto");
  await correct.getByRole("button", { name: "Simpan" }).click();
  await expect(correct).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Riwayat paket" })).toContainText("Koreksi", { timeout: 30_000 });
  await expect(page.getByRole("table", { name: "Sisa paket" })).toContainText("2 dari 3");

  await page.goto(unusedUrl);
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "Batalkan paket lama" }).click();
  const cancel = page.getByRole("dialog", { name: "Batalkan paket lama" });
  await cancel.getByLabel("Alasan").fill("Terketik dua kali");
  await cancel.getByRole("button", { name: "Batalkan paket" }).click();
  await expect(cancel).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible({ timeout: 30_000 });
});
