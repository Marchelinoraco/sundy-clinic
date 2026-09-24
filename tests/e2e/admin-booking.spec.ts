import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { E2E_BASE_URL } from "./test-env";

// Setiap uji di berkas ini memesan slot dr. Diane. Dijalankan berurutan agar
// tidak saling merebut slot, dan tiap proyek (desktop/ponsel) memakai hari
// yang berbeda karena keduanya berjalan paralel di worker terpisah.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

/** Hari kerja berikutnya dalam WITA: Senin untuk desktop, Selasa untuk ponsel. */
function bookingDate(testInfo: TestInfo): string {
  const weekday = testInfo.project.name === "mobile" ? 2 : 1;
  const nowWita = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const date = new Date(
    Date.UTC(nowWita.getUTCFullYear(), nowWita.getUTCMonth(), nowWita.getUTCDate()),
  );
  do date.setUTCDate(date.getUTCDate() + 1);
  while (date.getUTCDay() !== weekday);
  return date.toISOString().slice(0, 10);
}

async function signIn(page: Page) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Kata Sandi").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
}

async function newSignedInPage(browser: Browser, testInfo: TestInfo) {
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const context = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL: E2E_BASE_URL,
  });
  const page = await context.newPage();
  await signIn(page);
  return page;
}

async function createPatientInForm(page: Page, name: string, whatsapp: string) {
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  await page.getByLabel("Nama", { exact: true }).fill(name);
  await page.getByLabel("Nomor WhatsApp").fill(whatsapp);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });
}

function slotButtons(page: Page) {
  return page.getByRole("group", { name: "Pilih jam" }).getByRole("button");
}

async function openConsultationSlots(page: Page, date: string) {
  // Konsultasi adalah pilihan bawaan dan dr. Diane satu-satunya dokter,
  // sehingga tenaga sudah terpilih otomatis.
  await expect(page.locator("#booking-staff")).toContainText("Diane");
  await page.getByLabel("Tanggal").fill(date);
  await expect(slotButtons(page).first()).toBeVisible({ timeout: 30_000 });
}

function uniqueWhatsapp(prefix: string) {
  return `08${prefix}${Date.now().toString().slice(-8)}`;
}

test("admin mencatat booking telepon dari nol lalu memverifikasinya", async ({ page }, testInfo) => {
  const date = bookingDate(testInfo);
  const patientName = `Pasien E2E ${Date.now().toString().slice(-6)}`;

  await signIn(page);
  await page.goto("/admin/booking/baru");
  await createPatientInForm(page, patientName, uniqueWhatsapp("12"));
  await openConsultationSlots(page, date);

  const slot = slotButtons(page).first();
  const slotLabel = (await slot.textContent())!;
  await slot.click();
  await page.getByRole("button", { name: "Buat Booking" }).click();

  // Toast tampil sesaat sebelum pindah halaman dan hilang setelah beberapa
  // detik — diperiksa lebih dulu, sebelum menunggu halaman tujuan selesai dimuat.
  await expect(
    page.getByText(new RegExp(`Booking SDY-[A-Z0-9]{4} dibuat — ${patientName}`)),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/booking$/, { timeout: 30_000 });

  // Booking muncul di daftar harian, lalu diverifikasi.
  await page.goto(`/admin/booking?tanggal=${date}`);
  const row = page.getByRole("row").filter({ hasText: patientName });
  await expect(row).toContainText(slotLabel);
  await expect(row).toContainText("Menunggu Konfirmasi");
  await row.getByRole("button", { name: "Verifikasi" }).click();
  await expect(row).toContainText("Terkonfirmasi");

  // Konfirmasi WhatsApp dikirim ke nomor pasien, bukan nomor klinik.
  const waLink = row.getByRole("link", { name: "Kirim WhatsApp" });
  await expect(waLink).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);
  await expect(waLink).not.toHaveAttribute("href", /wa\.me\/6285172228900/);
});

test("slot yang sudah dipesan tidak ditawarkan lagi, dan rebutan slot ditolak dengan pesan jelas", async ({
  browser,
}, testInfo) => {
  const date = bookingDate(testInfo);
  const suffix = Date.now().toString().slice(-6);

  // Dua admin membuka form yang sama dan memilih jam yang sama.
  const first = await newSignedInPage(browser, testInfo);
  const second = await newSignedInPage(browser, testInfo);

  await first.goto("/admin/booking/baru");
  await createPatientInForm(first, `Pasien Rebutan A ${suffix}`, uniqueWhatsapp("13"));
  await openConsultationSlots(first, date);

  await second.goto("/admin/booking/baru");
  await createPatientInForm(second, `Pasien Rebutan B ${suffix}`, uniqueWhatsapp("14"));
  await openConsultationSlots(second, date);

  const slotLabel = (await slotButtons(first).last().textContent())!;
  await first.getByRole("group", { name: "Pilih jam" }).getByRole("button", { name: slotLabel }).click();
  await second.getByRole("group", { name: "Pilih jam" }).getByRole("button", { name: slotLabel }).click();

  await first.getByRole("button", { name: "Buat Booking" }).click();
  await expect(first).toHaveURL(/\/admin\/booking$/, { timeout: 30_000 });

  // Admin kedua masih melihat slot itu, tetapi basis data menolaknya — dan
  // yang tampil adalah pesan yang bisa dipahami, bukan galat SQL.
  await second.getByRole("button", { name: "Buat Booking" }).click();
  await expect(second.getByText("Slot baru saja terisi. Pilih jam lain.")).toBeVisible();
  await expect(second).toHaveURL(/\/admin\/booking\/baru$/);

  // Daftar slot dimuat ulang: jam yang direbut tidak lagi ditawarkan.
  await expect(
    second.getByRole("group", { name: "Pilih jam" }).getByRole("button", { name: slotLabel }),
  ).toHaveCount(0);
});
