import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";

// Satu cerita berurutan: pasien mendaftar → admin mencocokkan & memverifikasi
// → resepsionis tidak melihat isi klinis → pasien membatalkan. Proyek desktop
// dan ponsel berjalan paralel, masing-masing dengan hari dan pasien sendiri.
// admin-booking.spec memakai Senin & Selasa; berkas ini Rabu & Kamis.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function bookingDate(testInfo: TestInfo): string {
  const weekday = testInfo.project.name === "mobile" ? 4 : 3;
  const nowWita = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const date = new Date(Date.UTC(nowWita.getUTCFullYear(), nowWita.getUTCMonth(), nowWita.getUTCDate()));
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== weekday);
  return date.toISOString().slice(0, 10);
}

function patientFor(testInfo: TestInfo) {
  return testInfo.project.name === "mobile"
    ? { name: "Pasien Ponsel E2E", whatsapp: "081299990002" }
    : { name: "Pasien Desktop E2E", whatsapp: "081299990001" };
}

let booking: { code: string; date: string } | null = null;
let intakeUrl: string | null = null;

const choose = (page: Page, name: string | RegExp) =>
  page.getByRole("radio", typeof name === "string" ? { name, exact: true } : { name }).click();
const tick = (page: Page, name: string) => page.getByRole("checkbox", { name, exact: true }).click();
const next = (page: Page) => page.getByRole("button", { name: "Lanjut", exact: true }).click();
const inGroup = (page: Page, group: string, option: string) =>
  page.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name: option, exact: true }).click();

async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Kata Sandi").fill(account.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

test("pasien baru Slimming mendaftar sampai mendapat kode booking", async ({ page }, testInfo) => {
  const date = bookingDate(testInfo);
  const patient = patientFor(testInfo);

  await page.goto("/daftar");
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
  await expect(page.getByText(/IMT Anda ± 28,8/)).toBeVisible();
  await next(page);
  await page.getByLabel("Pagi", { exact: true }).fill("Nasi kuning, teh manis");
  await next(page);
  await tick(page, "Darah tinggi");
  await next(page);
  await page.getByLabel("Obat untuk Darah tinggi").fill("Amlodipine 5 mg, 1× sehari");
  await next(page);
  await inGroup(page, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(page, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(page);
  await choose(page, "Tidak");

  await expect(page.getByRole("heading", { name: "Ringkasan jawaban Anda" })).toBeVisible();
  await expect(page.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari")).toBeVisible();
  await page.getByRole("button", { name: "Pilih layanan & jadwal" }).click();

  await expect(page.getByText("Rp 100.000").first()).toBeVisible();
  await next(page);

  await page.getByLabel("Tanggal", { exact: true }).fill(date);
  await page.getByRole("group", { name: "Pilih jam" }).getByRole("button").first().click();
  await expect(page.getByText(/ditahan untuk Anda sampai pukul/)).toBeVisible();
  await next(page);

  await page.getByLabel("Nama lengkap").fill(patient.name);
  await page.getByLabel("Nomor WhatsApp").fill(patient.whatsapp);
  await page.getByLabel("Tanggal lahir").fill("1992-04-17");
  await inGroup(page, "Jenis kelamin", "Perempuan");
  await page.getByLabel("Pekerjaan").fill("Guru");
  await page.getByLabel("Alamat").fill("Jl. Uji E2E No. 1, Manado");
  await page.getByRole("checkbox", { name: /Kebijakan Privasi/ }).check();
  await page.getByRole("checkbox", { name: /mentransfer biaya booking/ }).check();
  await page.getByRole("button", { name: "Kirim pendaftaran" }).click();

  await expect(page.getByRole("heading", { name: "Pendaftaran diterima" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/BCA 1234567890 a\.n\. SunDY Clinic/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Konfirmasi via WhatsApp" })).toHaveAttribute("href", /wa\.me/);
  const code = (await page.getByText(/^SDY-[A-Z0-9]{4}$/).textContent())?.trim();
  expect(code).toMatch(/^SDY-[A-Z0-9]{4}$/);
  booking = { code: code!, date };
});

test("admin mencocokkan pasien, memverifikasi, lalu membaca isiannya", async ({ page }, testInfo) => {
  test.skip(!booking, "Butuh booking dari uji sebelumnya.");
  await signIn(page, E2E_ADMIN);
  await page.goto(`/admin/booking?tanggal=${booking!.date}`);

  const row = page.getByRole("row").filter({ hasText: booking!.code });
  await expect(row.getByText("Belum dicocokkan", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Cocokkan pasien" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(patientFor(testInfo).name).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Buat pasien baru" }).click();
  await expect(row.getByText("Belum dicocokkan", { exact: true })).toBeHidden({ timeout: 30_000 });

  await row.getByRole("button", { name: "Verifikasi" }).click();
  await expect(row.getByText("Terkonfirmasi", { exact: true })).toBeVisible({ timeout: 30_000 });

  await row.getByRole("link", { name: "Lihat isian" }).click();
  // Rute /admin/isian/[id] belum pernah dikompilasi next dev di uji manapun
  // sebelumnya; dengan worker paralel navigasi pertama bisa lebih lambat
  // dari batas waktu bawaan (lihat catatan di playwright.config.ts).
  await expect(page.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("72 kg · 158 cm · IMT 28,8")).toBeVisible();
  intakeUrl = page.url();
});

test("resepsionis melihat booking tanpa isi klinis isian", async ({ page }) => {
  test.skip(!booking || !intakeUrl, "Butuh booking dan isian dari uji sebelumnya.");
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto(`/admin/booking?tanggal=${booking!.date}`);

  const row = page.getByRole("row").filter({ hasText: booking!.code });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link", { name: "Lihat isian" })).toHaveCount(0);

  await page.goto(intakeUrl!);
  await expect(page.getByText(/Amlodipine/)).toHaveCount(0);
});

test("pasien membatalkan booking lewat cek booking", async ({ page }, testInfo) => {
  test.skip(!booking, "Butuh booking dari uji sebelumnya.");
  await page.goto("/cek-booking");
  await page.getByLabel("Kode booking").fill(booking!.code);
  await page.getByLabel("4 digit terakhir nomor WhatsApp").fill(patientFor(testInfo).whatsapp.slice(-4));
  await page.getByRole("button", { name: "Cek Status" }).click();

  await expect(page.getByText("Terkonfirmasi", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pindah jadwal via WhatsApp" })).toBeVisible();

  await page.getByRole("button", { name: "Batalkan booking" }).click();
  await expect(page.getByText(/tidak dikembalikan/)).toBeVisible();
  await page.getByRole("button", { name: "Ya, batalkan" }).click();
  await expect(page.getByText("Dibatalkan", { exact: true })).toBeVisible();
});
