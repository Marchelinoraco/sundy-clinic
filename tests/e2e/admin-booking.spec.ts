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
  // sehingga tenaga sudah terpilih otomatis dan strip tanggal langsung tampil.
  await expect(page.locator("#booking-staff")).toContainText("Diane");
  await page
    .getByRole("group", { name: "Pilih tanggal" })
    .locator(`[data-date="${date}"]`)
    .click({ timeout: 30_000 });
  await expect(slotButtons(page).first()).toBeVisible({ timeout: 30_000 });
}

function uniqueWhatsapp(prefix: string) {
  return `08${prefix}${Date.now().toString().slice(-8)}`;
}

test("admin mencatat booking WA lewat strip tanggal, mengirim instruksi transfer, lalu menemukannya lagi", async ({
  page,
}, testInfo) => {
  const date = bookingDate(testInfo);
  const patientName = `Pasien E2E ${Date.now().toString().slice(-6)}`;

  await signIn(page);
  await page.goto("/admin/booking/baru");
  await createPatientInForm(page, patientName, uniqueWhatsapp("12"));
  // WhatsApp adalah sumber bawaan.
  await expect(page.getByRole("button", { name: "WhatsApp", exact: true })).toHaveAttribute("aria-pressed", "true");
  await openConsultationSlots(page, date);

  const slot = slotButtons(page).first();
  const slotLabel = (await slot.textContent())!;
  await slot.click();
  await page.getByRole("button", { name: "Buat Booking" }).click();

  // Halaman tidak pindah: ringkasan berganti panel "Booking dibuat".
  const heading = page.getByRole("heading", { name: /Booking SDY-[A-Z0-9]{4} dibuat/ });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  const code = (await heading.textContent())!.match(/SDY-[A-Z0-9]{4}/)![0];
  await expect(page).toHaveURL(/\/admin\/booking\/baru$/);

  // Instruksi transfer ke nomor pasien, bukan nomor klinik, dan memuat kode booking.
  const transferLink = page.getByRole("link", { name: "Kirim instruksi transfer via WA" });
  await expect(transferLink).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);
  await expect(transferLink).not.toHaveAttribute("href", /wa\.me\/6285172228900/);
  await expect(transferLink).toHaveAttribute("href", new RegExp(code));

  // "Lihat di daftar" membuka tanggal booking dengan tepat satu baris tersorot.
  await page.getByRole("link", { name: /Lihat di daftar/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/booking\\?tanggal=${date}&sorot=`), { timeout: 30_000 });
  const row = page.locator('tr[data-highlighted="true"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(code);
  await expect(row).toContainText(slotLabel);
  await expect(row).toContainText("Menunggu Konfirmasi");

  // Booking WA ikut daftar "Menunggu konfirmasi" dengan batas transfernya.
  const pendingRow = page
    .getByRole("region", { name: /^Menunggu konfirmasi/ })
    .getByRole("row")
    .filter({ hasText: code });
  await expect(pendingRow).toContainText("Batas transfer");

  // Verifikasi dari baris tersorot; booking keluar dari daftar menunggu.
  await row.getByRole("button", { name: "Verifikasi" }).click();
  await expect(row).toContainText("Terkonfirmasi", { timeout: 30_000 });
  await expect(pendingRow).toHaveCount(0);
  const confirmLink = row.getByRole("link", { name: "Kirim konfirmasi" });
  await expect(confirmLink).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);

  // Pencarian per kode tanpa peduli huruf besar/kecil, dengan tanggal di barisnya.
  const search = page.getByLabel("Cari kode, nama, atau WA");
  await search.fill(code.toLowerCase());
  await search.press("Enter");
  const results = page.getByRole("region", { name: /^Hasil pencarian/ });
  await expect(results.getByRole("row").filter({ hasText: code })).toContainText(slotLabel, { timeout: 30_000 });
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
  await expect(first.getByRole("heading", { name: /Booking SDY-[A-Z0-9]{4} dibuat/ })).toBeVisible({
    timeout: 30_000,
  });

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
