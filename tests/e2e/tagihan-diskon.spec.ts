import { expect, test } from "@playwright/test";
import { E2E_ADMIN, E2E_APOTEKER, E2E_RESEPSIONIS } from "./credentials";
import { aturHargaJual } from "./helpers/harga";
import { isiTanggal, pilihOpsi, tungguHidrasi } from "./helpers/mui";
import { buatPasienBaru } from "./helpers/pasien-baru";
import { signIn } from "./helpers/quiz";

test.setTimeout(240_000);

test("promo barang, diskon baris dalam batas 20%, catatan, dan transfer ke rekening klinik", async ({ page, browser }, testInfo) => {
  const t = `${testInfo.project.name === "mobile" ? "M" : "D"}${Date.now().toString().slice(-6)}`;
  const itemName = `Serum Diskon ${t}`;

  // Super Admin menambah rekening klinik.
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/pengaturan");
  await tungguHidrasi(page);
  await page.getByRole("button", { name: "+ Rekening" }).click();
  const accountDialog = page.getByRole("dialog", { name: "Tambah rekening" });
  await accountDialog.getByLabel("Nama bank").fill(`Bank E2E ${t}`);
  await accountDialog.getByLabel("Nomor rekening").fill(`9${Date.now().toString().slice(-8)}`);
  await accountDialog.getByLabel("Nama pemilik").fill("SunDY Clinic");
  await accountDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(accountDialog).toBeHidden({ timeout: 30_000 });

  // Apoteker menambah barang tanpa harga dan mencatat stok.
  const apoteker = await browser.newContext();
  const ap = await apoteker.newPage();
  await signIn(ap, E2E_APOTEKER);
  await ap.goto("/admin/stok");
  await ap.getByRole("button", { name: "+ Barang" }).click();
  const itemDialog = ap.getByRole("dialog", { name: "Tambah barang" });
  await expect(itemDialog.getByLabel("Harga jual")).toHaveCount(0);
  await itemDialog.getByLabel("Kode").fill(`E2E-${t}-SRM`);
  await itemDialog.getByLabel("Nama", { exact: true }).fill(itemName);
  await itemDialog.getByLabel("Satuan").fill("botol");
  await itemDialog.getByLabel("Batas menipis").fill("1");
  await itemDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(itemDialog).toBeHidden({ timeout: 30_000 });
  await ap.goto("/admin/stok/masuk/baru");
  await ap.getByRole("button", { name: "+ Supplier baru" }).click();
  const supplierDialog = ap.getByRole("dialog", { name: "Tambah supplier" });
  await supplierDialog.getByLabel("Nama supplier").fill(`Supplier Diskon ${t}`);
  await supplierDialog.getByRole("button", { name: "Simpan" }).click();
  await expect(supplierDialog).toBeHidden({ timeout: 30_000 });
  await ap.getByLabel("Nomor faktur").fill(`DS-E2E-${t}`);
  await pilihOpsi(ap, "Barang baris 1", `${itemName} (E2E-${t}-SRM)`);
  await ap.getByLabel("Jumlah baris 1").fill("5");
  await ap.getByLabel("Batch baris 1").fill("B-1");
  await isiTanggal(ap, "Kedaluwarsa baris 1", "2030-12-31");
  await ap.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(ap).toHaveURL(/\/admin\/stok\/masuk\/(?!baru)[^/]+$/, { timeout: 30_000 });
  await apoteker.close();

  // Admin Keuangan mengisi harga dan promo 10%.
  await aturHargaJual(browser, itemName, "150000", { name: "Promo E2E", percent: "10" });

  // Resepsionis menagih.
  const resep = await browser.newContext();
  const rp = await resep.newPage();
  await signIn(rp, E2E_RESEPSIONIS);
  await rp.goto("/admin/tagihan");
  await tungguHidrasi(rp);
  await rp.getByRole("button", { name: "+ Penjualan langsung" }).click();
  const saleDialog = rp.getByRole("dialog", { name: "Penjualan langsung" });
  await saleDialog.getByRole("button", { name: "+ Pasien Baru" }).click();
  await buatPasienBaru(rp, { name: `Pelanggan Diskon ${t}`, whatsapp: `0813${Date.now().toString().slice(-8)}` });
  await expect(rp).toHaveURL(/\/admin\/tagihan\/[^/?]+$/, { timeout: 30_000 });
  await rp.getByRole("button", { name: "+ Tambah barang" }).click();
  const addItem = rp.getByRole("dialog", { name: "Tambah barang" });
  await pilihOpsi(addItem, "Barang", `${itemName} (E2E-${t}-SRM) — sisa 5 botol`);
  await addItem.getByLabel("Jumlah").fill("2");
  await addItem.getByRole("button", { name: "Tambah" }).click();
  await expect(addItem).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByText(/Diskon −Rp 30\.000 · Promo: Promo E2E/)).toBeVisible({ timeout: 30_000 });

  await rp.getByRole("button", { name: "+ Baris layanan" }).click();
  const lineDialog = rp.getByRole("dialog", { name: "Tambah baris layanan" });
  await lineDialog.getByLabel("Nama", { exact: true }).fill("Facial Diskon");
  await lineDialog.getByLabel("Harga").fill("100000");
  await lineDialog.getByRole("button", { name: "Tambah" }).click();
  await expect(lineDialog).toBeHidden({ timeout: 30_000 });

  // Kotor 400.000 → batas 80.000. Manual 90.000 ditolak, 50.000 diterima.
  await rp.getByRole("button", { name: "Diskon Facial Diskon" }).click();
  const discount = rp.getByRole("dialog", { name: "Diskon Facial Diskon" });
  await discount.getByLabel("Nominal").fill("90000");
  await discount.getByLabel("Alasan").fill("Pelanggan lama");
  await discount.getByRole("button", { name: "Terapkan" }).click();
  await expect(discount.getByRole("alert")).toHaveText("Diskon di atas 20% diberikan oleh Admin Keuangan.");
  await discount.getByLabel("Nominal").fill("50000");
  await discount.getByRole("button", { name: "Terapkan" }).click();
  await expect(discount).toBeHidden({ timeout: 30_000 });
  const summary = rp.getByRole("region", { name: "Ringkasan tagihan" });
  await expect(summary).toContainText("Rp 320.000", { timeout: 30_000 });

  await rp.getByLabel("Catatan internal").fill("inject ke 1 L jam 10.00");
  await rp.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(rp.getByText("Catatan disimpan.")).toBeVisible({ timeout: 30_000 });

  await rp.getByRole("button", { name: "Finalkan tagihan" }).click();
  await rp.getByRole("dialog", { name: "Finalkan tagihan?" }).getByRole("button", { name: "Finalkan" }).click();
  await expect(rp.getByRole("heading", { name: /Tagihan TG-\d{4}-\d{4}/ })).toBeVisible({ timeout: 30_000 });

  await rp.getByRole("region", { name: "Pembayaran" }).getByRole("button", { name: "Catat pembayaran" }).click();
  const pay = rp.getByRole("dialog", { name: "Catat pembayaran" });
  await pay.getByLabel("Metode").selectOption("TRANSFER");
  const account = pay.getByLabel("Rekening tujuan");
  await account.selectOption((await account.locator("option", { hasText: `Bank E2E ${t}` }).getAttribute("value")) ?? "");
  await pay.getByLabel("Bank pengirim (opsional)").fill("BRI");
  await pay.getByLabel("Nomor referensi (opsional)").fill(`REF-${t}`);
  await pay.getByRole("button", { name: "Simpan" }).click();
  await expect(pay).toBeHidden({ timeout: 30_000 });
  await expect(rp.getByRole("region", { name: "Pembayaran" })).toContainText(`Ke Bank E2E ${t}`, { timeout: 30_000 });
  await expect(rp.getByRole("region", { name: "Pembayaran" })).toContainText(`Ref. REF-${t}`);
  await resep.close();
});
