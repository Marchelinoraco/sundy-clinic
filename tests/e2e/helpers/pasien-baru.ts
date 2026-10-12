import { expect, type Locator, type Page } from "@playwright/test";
import { isiTanggal } from "./mui";

let sequence = 0;

/**
 * NIK 16 angka yang berbeda di tiap panggilan dan tiap proses uji. Bagian 7–12 ("010190") = 1 Januari 1990,
 * cocok dengan tanggal lahir bawaan helper ini sehingga tidak ada peringatan kecocokan.
 */
export function uniqueNik(): string {
  sequence += 1;
  return `717101010190${String((Date.now() + sequence * 7919) % 10_000).padStart(4, "0")}`;
}

export type IsianPasienBaru = { name: string; whatsapp: string; nik?: string };

/** Mengisi dialog "Pasien baru" (harus sudah dibuka lewat tombol "+ Pasien Baru") tanpa menyimpan. */
export async function isiPasienBaru(page: Page, { name, whatsapp, nik = uniqueNik() }: IsianPasienBaru): Promise<Locator> {
  const dialog = page.getByRole("dialog", { name: "Pasien baru" });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("NIK (16 angka)").fill(nik);
  await dialog.getByLabel("Nama", { exact: true }).fill(name);
  await isiTanggal(dialog, "Tanggal lahir", "1990-01-01");
  await dialog.getByLabel("No. HP (WhatsApp)").fill(whatsapp);
  await dialog.getByLabel("Nama kontak darurat").fill("Budi Kontak");
  await dialog.getByLabel("Nomor kontak darurat").fill("081200000099");
  await dialog.getByLabel("Alamat").fill("Jl. Uji Coba 1, Manado");
  return dialog;
}

/** Mengisi dialog "Pasien baru" lalu menyimpan. */
export async function buatPasienBaru(page: Page, isian: IsianPasienBaru): Promise<void> {
  const dialog = await isiPasienBaru(page, isian);
  await dialog.getByRole("button", { name: "Buat Pasien" }).click();
}
