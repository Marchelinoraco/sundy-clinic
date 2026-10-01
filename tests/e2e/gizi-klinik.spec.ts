import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { choose, fillFormRecall, inGroup, next, signIn, tick, upcomingWeekday } from "./helpers/quiz";

// Jumat untuk desktop, Sabtu untuk ponsel: admin-booking.spec memakai Senin &
// Selasa, public-registration.spec Rabu & Kamis — slot tidak saling berebut.
test.setTimeout(180_000);

function customerFor(testInfo: TestInfo) {
  return testInfo.project.name === "mobile"
    ? { name: "Gizi Ponsel E2E", whatsapp: "081299990004", weekday: 6 }
    : { name: "Gizi Desktop E2E", whatsapp: "081299990003", weekday: 5 };
}

test("customer gizi klinik mendaftar, lalu dokter melihat kebiasaannya sebagai tabel per jam", async ({ page }, testInfo) => {
  const customer = customerFor(testInfo);

  await page.goto("/daftar");
  await choose(page, "Belum, ini pertama kali");
  await choose(page, /^Konsultasi dokter spesialis gizi klinik/);
  await page.getByLabel("Jawaban Anda").fill("Gula darah tinggi, ingin atur pola makan.");
  await next(page);
  await page.getByLabel("Berat badan").fill("65");
  await page.getByLabel("Tinggi badan").fill("160");
  await next(page);
  await fillFormRecall(page);
  await tick(page, "Diabetes");
  await next(page);
  await page.getByLabel("Obat untuk Diabetes").fill("Metformin 500 mg, 2× sehari");
  await next(page);
  await inGroup(page, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(page, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(page);
  await choose(page, "Tidak");

  await expect(page.getByRole("heading", { name: "Ringkasan jawaban Anda" })).toBeVisible();
  await expect(page.getByText("Konsultasi dokter spesialis gizi klinik · pertama kali ke SunDY")).toBeVisible();
  await expect(page.getByText("07.00: Nasi kuning 1 piring, teh manis 1 gelas")).toBeVisible();
  await expect(page.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);
  await page.getByRole("button", { name: "Pilih layanan & jadwal" }).click();

  await expect(page.getByText("Rp 100.000").first()).toBeVisible();
  await next(page);

  await page.getByLabel("Tanggal", { exact: true }).fill(upcomingWeekday(customer.weekday));
  await page.getByRole("group", { name: "Pilih jam" }).getByRole("button").first().click();
  await expect(page.getByText(/ditahan untuk Anda sampai pukul/)).toBeVisible();
  await next(page);

  await page.getByLabel("Nama lengkap").fill(customer.name);
  await page.getByLabel("Nomor WhatsApp").fill(customer.whatsapp);
  await page.getByLabel("Tanggal lahir").fill("1988-03-12");
  await inGroup(page, "Jenis kelamin", "Laki-laki");
  await page.getByLabel("Pekerjaan").fill("Wiraswasta");
  await page.getByLabel("Alamat").fill("Jl. Uji Gizi No. 2, Manado");
  await page.getByRole("checkbox", { name: /Kebijakan Privasi/ }).check();
  await page.getByRole("checkbox", { name: /mentransfer biaya booking/ }).check();
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();

  await expect(page.getByRole("heading", { name: "Pendaftaran diterima" })).toBeVisible({ timeout: 30_000 });
  const code = (await page.getByText(/^SDY-[A-Z0-9]{4}$/).textContent())?.trim();
  expect(code).toMatch(/^SDY-[A-Z0-9]{4}$/);

  // Dokter (Super Admin di uji ini) membuka isian dari daftar booking situs yang menunggu.
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/booking");
  const row = page
    .getByRole("region", { name: /^Menunggu konfirmasi/ })
    .getByRole("row")
    .filter({ hasText: code! });
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Lihat isian" }).click();

  const table = page.getByRole("table", { name: "Kebiasaan sehari" });
  await expect(table).toBeVisible({ timeout: 30_000 });
  await expect(table.getByRole("row").filter({ hasText: "07.00" })).toContainText(
    "Sarapan: Nasi kuning 1 piring, teh manis 1 gelas",
  );
  await expect(table.getByRole("row").filter({ hasText: "17.00" })).toContainText(
    "Olahraga: Jalan kaki, 30 menit, 2× seminggu",
  );
  await expect(page.getByText("Rokok: Tidak · Alkohol: Tidak · Soda: Kadang")).toBeVisible();
  await expect(page.getByText("Gula darah tinggi, ingin atur pola makan.")).toBeVisible();
});
