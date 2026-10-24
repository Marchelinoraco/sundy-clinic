import { expect, test } from "@playwright/test";
import { E2E_RESEPSIONIS } from "./credentials";
import { setujui } from "./helpers/approval";
import { tungguHidrasi } from "./helpers/mui";
import { signIn } from "./helpers/quiz";

// Deposit (spec deposit): biaya booking yang sudah diverifikasi memotong tagihan kunjungan, kelebihan bayar QRIS menjadi
// saldo deposit, lalu saldo dikembalikan tunai dengan PIN Admin Keuangan. Data per proyek dari prepare-db.mts.
test.setTimeout(180_000);

const rupiah = (text: string) => Number(text.replace(/[^\d]/g, ""));

test("deposit booking memotong tagihan, kelebihan QRIS menjadi saldo, lalu dikembalikan dengan PIN", async ({ page }, testInfo) => {
  const patientName = `Pasien Deposit ${testInfo.project.name === "mobile" ? "mobile" : "desktop"}`;
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto("/admin/tagihan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: `Buat tagihan ${patientName}` }).click();
  await expect(page).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });

  // Draf: perkiraan potongan deposit booking (D9).
  const summary = page.getByRole("region", { name: "Ringkasan tagihan" });
  await expect(summary).toContainText("Deposit booking (perkiraan)-Rp 100.000", { timeout: 30_000 });
  await page.getByRole("button", { name: "Finalkan tagihan" }).click();
  await page.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(page.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });
  await expect(summary).toContainText("Deposit booking-Rp 100.000");
  // Menu samping juga bernama "Deposit": cari di isi halaman saja.
  await expect(page.getByRole("main").getByText("Deposit", { exact: true })).toBeVisible();

  // QRIS sebesar sisa + Rp 300.000: lunas, kelebihannya menjadi saldo 30 hari (D5).
  await page.getByRole("button", { name: "Catat pembayaran" }).click();
  const pay = page.getByRole("dialog", { name: "Catat pembayaran" });
  const sisa = rupiah((await pay.getByText(/^Sisa tagihan Rp/).textContent()) ?? "");
  expect(sisa).toBeGreaterThan(0);
  await pay.getByLabel("Metode").selectOption("QRIS");
  await pay.getByLabel("Nominal").fill(String(sisa + 300_000));
  await expect(pay).toContainText("Kelebihan Rp 300.000 menjadi saldo deposit pasien, berlaku 30 hari.");
  await pay.getByRole("button", { name: "Simpan" }).click();
  await expect(pay).toBeHidden({ timeout: 30_000 });
  await expect(summary).toContainText(/Kelebihan Rp 300\.000 menjadi deposit, berlaku s\.d\. \d{1,2} \S+ \d{4}/, { timeout: 30_000 });
  await expect(page.getByRole("main").getByText("Lunas", { exact: true })).toBeVisible();

  // Menu Deposit, tab Aktif (D18).
  await page.goto("/admin/deposit");
  await tungguHidrasi(page);
  const row = page.getByRole("table", { name: "Saldo deposit aktif" }).getByRole("row").filter({ hasText: patientName });
  await expect(row).toContainText("Rp 300.000");

  // Pengembalian di bawah Rp 200.000 ditolak; Rp 200.000 tunai dengan PIN berhasil (D15, D16).
  await row.getByRole("button", { name: "Kembalikan uang" }).click();
  const refund = page.getByRole("dialog", { name: "Kembalikan uang deposit" });
  await refund.getByLabel("Jumlah").fill("150000");
  await refund.getByLabel("Alasan").fill("Pasien pindah kota");
  await refund.getByRole("button", { name: "Kembalikan" }).click();
  await expect(refund).toContainText("Pengembalian minimal Rp 200.000.");
  await refund.getByLabel("Jumlah").fill("200000");
  await refund.getByRole("button", { name: "Kembalikan" }).click();
  await setujui(page);
  await expect(refund).toBeHidden({ timeout: 30_000 });
  await expect(row).toContainText("Rp 100.000", { timeout: 30_000 });
  await expect(row.getByRole("button", { name: "Kembalikan uang" })).toHaveCount(0);

  // Riwayat memuat pengembalian dengan penyetujunya.
  await page.goto("/admin/deposit?tab=riwayat");
  await tungguHidrasi(page);
  const history = page.getByRole("table", { name: "Riwayat deposit" });
  const refunded = history.getByRole("row").filter({ hasText: patientName }).filter({ hasText: "Dikembalikan" });
  await expect(refunded).toContainText("-Rp 200.000");
  await expect(refunded).toContainText("disetujui Keuangan E2E");
  await expect(history.getByRole("row").filter({ hasText: patientName }).filter({ hasText: "Dipakai" })).toContainText("-Rp 100.000");
});
