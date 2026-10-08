import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { choose, fillFormRecall, inGroup, next, signIn, tick } from "./helpers/quiz";
import { isiTanggal } from "./helpers/mui";

// Dua cerita. (1) Customer memilih konsultasi online di /daftar → admin mencocokkan dan memverifikasi →
// dokter memulai konsultasi dari dasbor dan memfinalisasi. (2) Booking online yang rentangnya lewat
// tampil "Perlu waktu baru" → resepsionis mengubah waktu luang → booking kembali ke daftar dokter.
// Desktop dan ponsel berjalan paralel, masing-masing dengan pasien sendiri.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

/** Tanggal WITA ("YYYY-MM-DD") `days` hari dari sekarang. */
function dayFromToday(days: number): string {
  const date = new Date(Date.now() + 8 * 3600_000 + days * 24 * 3600_000);
  return date.toISOString().slice(0, 10);
}

const customerFor = (testInfo: TestInfo) =>
  testInfo.project.name === "mobile"
    ? { name: "Online Ponsel E2E", whatsapp: "081299990012" }
    : { name: "Online Desktop E2E", whatsapp: "081299990011" };

let booking: { code: string } | null = null;

async function fillSlimmingQuiz(page: Page) {
  await choose(page, "Belum, ini pertama kali");
  await choose(page, /^Slimming/);
  await choose(page, "Menurunkan berat badan");
  await choose(page, "5–10 kg");
  await tick(page, "Perut");
  await next(page);
  await choose(page, "Pernah");
  await tick(page, "Kurangi nasi / karbo");
  await next(page);
  await inGroup(page, "Hasil Kurangi nasi / karbo", "Berhasil");
  await page.getByLabel("Turun berapa kg? (Kurangi nasi / karbo)").fill("8");
  await inGroup(page, "Berat sekarang setelah Kurangi nasi / karbo", "Naik sebagian");
  await next(page);
  await page.getByLabel("Berat badan").fill("72");
  await page.getByLabel("Tinggi badan").fill("158");
  await next(page);
  await fillFormRecall(page);
  await tick(page, "Darah tinggi");
  await next(page);
  await page.getByLabel("Obat untuk Darah tinggi").fill("Amlodipine 5 mg, 1× sehari");
  await next(page);
  await inGroup(page, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(page, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(page);
  await choose(page, "Tidak");
}

test("customer mendaftar konsultasi online dua waktu sampai mendapat total transfer", async ({ page }) => {
  const customer = customerFor(test.info());
  await page.goto("/daftar");
  await fillSlimmingQuiz(page);
  await page.getByRole("button", { name: "Pilih layanan & jadwal" }).click();

  await choose(page, /^Online lewat WhatsApp/);
  await expect(page.getByText("Total transfer di muka")).toBeVisible();
  await expect(page.getByText("Rp 350.000").first()).toBeVisible();
  await next(page);

  await expect(page.getByRole("heading", { name: "Kapan Anda bisa dihubungi?" })).toBeVisible();
  const doctors = page.getByRole("radiogroup", { name: "Dokter", exact: true });
  if (await doctors.count()) await doctors.getByRole("radio").first().click();
  await page.getByLabel("Tanggal waktu 1").fill(dayFromToday(2));
  await page.getByRole("button", { name: "+ Tambah waktu" }).click();
  await page.getByLabel("Tanggal waktu 2").fill(dayFromToday(4));
  await next(page);

  await page.getByLabel("Nama lengkap").fill(customer.name);
  await page.getByLabel("Nomor WhatsApp").fill(customer.whatsapp);
  await page.getByLabel("Tanggal lahir").fill("1992-04-17");
  await inGroup(page, "Jenis kelamin", "Perempuan");
  await page.getByLabel("Pekerjaan").fill("Guru");
  await page.getByLabel("Alamat").fill("Jl. Uji E2E No. 1, Manado");
  await page.getByRole("checkbox", { name: /Kebijakan Privasi/ }).check();
  await page.getByRole("checkbox", { name: /mentransfer/ }).check();
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();

  await expect(page.getByRole("heading", { name: "Pendaftaran diterima" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Waktu Anda bisa dihubungi:")).toBeVisible();
  await expect(page.getByText(/total.*Rp 350\.000/)).toBeVisible();
  await expect(page.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);
  const code = (await page.getByText(/^SDY-[A-Z0-9]{4}$/).textContent())?.trim();
  expect(code).toMatch(/^SDY-[A-Z0-9]{4}$/);
  booking = { code: code! };
});

test("admin mencocokkan dan memverifikasi, dokter memulai konsultasi dan memfinalisasi", async ({ page }) => {
  test.skip(!booking, "Butuh booking dari uji sebelumnya.");
  const customer = customerFor(test.info());
  await signIn(page, E2E_ADMIN);

  await page.goto("/admin/booking");
  const pending = page.getByRole("region", { name: /^Menunggu konfirmasi/ });
  const pendingRow = pending.getByRole("row").filter({ hasText: booking!.code });
  await expect(pendingRow.getByText("Online", { exact: true }).first()).toBeVisible();
  await expect(pendingRow.getByText(/^•/).first()).toBeVisible();
  await pendingRow.getByRole("button", { name: "Cocokkan pasien" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(customer.name).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Buat pasien baru" }).click();
  await expect(pendingRow.getByText("Belum dicocokkan", { exact: true })).toBeHidden({ timeout: 30_000 });
  await pendingRow.getByRole("button", { name: "Verifikasi" }).click();
  await expect(pendingRow).toHaveCount(0, { timeout: 30_000 });

  // Booking terkonfirmasi pindah ke bagian "Konsultasi online"; tidak ada Check-in untuknya.
  await page.goto("/admin/booking");
  const onlineSection = page.getByRole("region", { name: /^Konsultasi online/ });
  const onlineRow = onlineSection.getByRole("row").filter({ hasText: booking!.code });
  await expect(onlineRow).toBeVisible({ timeout: 30_000 });
  await expect(onlineRow.getByRole("button", { name: "Check-in" })).toHaveCount(0);

  await page.goto("/admin");
  const work = page.getByRole("region", { name: "Konsultasi online" });
  const item = work.getByRole("listitem").filter({ hasText: customer.name });
  await expect(item).toBeVisible({ timeout: 30_000 });
  await expect(item.getByRole("link", { name: /^WhatsApp 62/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/62/);
  await item.getByRole("button", { name: "Tidak terhubung" }).click();
  await expect(item.getByText(/tidak terhubung/)).toBeVisible({ timeout: 30_000 });

  await item.getByRole("button", { name: "Mulai konsultasi" }).click();
  await expect(page).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await expect(page.getByText("Konsultasi online", { exact: true })).toBeVisible();
  await expect(page.getByText(/Online \(WhatsApp\)/).first()).toBeVisible();

  await page.getByLabel("Keluhan dan anamnesis dokter").fill("Berat naik 3 kg sejak Juli.");
  await page.getByLabel("Berat badan (kg)").fill("72");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Penilaian / diagnosis").fill("Obesitas derajat 1");
  await page.getByLabel("Rencana, program, dan resep").fill("Program MAX, kontrol 1 minggu.");
  await expect(page.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Finalisasi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(page.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });

  // Sudah dimulai: keluar dari daftar Konsultasi online dokter.
  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Konsultasi online" }).getByText(customer.name)).toHaveCount(0);
});

test("booking online yang rentangnya lewat: Perlu waktu baru, lalu Ubah waktu luang mengembalikannya ke dokter", async ({ page }, testInfo) => {
  const name = `Pasien Online Lapsed ${testInfo.project.name}`;
  await signIn(page, E2E_ADMIN);

  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Konsultasi online" }).getByText(name)).toHaveCount(0);

  await page.goto("/admin/booking");
  const onlineSection = page.getByRole("region", { name: /^Konsultasi online/ });
  const row = onlineSection.getByRole("row").filter({ hasText: name });
  await expect(row.getByText("Perlu waktu baru", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(row.getByRole("link", { name: "Minta waktu baru via WA" })).toHaveAttribute("href", /^https:\/\/wa\.me\/62/);

  await row.getByRole("button", { name: "Ubah waktu luang" }).click();
  const dialog = page.getByRole("dialog", { name: /^Ubah waktu luang/ });
  await isiTanggal(dialog, "Tanggal waktu 1", dayFromToday(3));
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(onlineSection.getByRole("row").filter({ hasText: name }).getByText("Perlu waktu baru")).toHaveCount(0, { timeout: 30_000 });

  await page.goto("/admin");
  await expect(page.getByRole("region", { name: "Konsultasi online" }).getByText(name)).toBeVisible({ timeout: 30_000 });
});

test("resepsionis tidak melihat bagian Konsultasi online di dasbor", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await expect(page.getByRole("region", { name: "Konsultasi online" })).toHaveCount(0);
});
