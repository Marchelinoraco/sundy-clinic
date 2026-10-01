import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { signIn, upcomingWeekday } from "./helpers/quiz";

// Satu cerita per proyek: pasien fixture (prepare-db.mts) punya booking terkonfirmasi di hari
// buka berikutnya, jadi hari pengingatnya hari ini. Pindah jadwal memakai Senin (desktop) atau
// Selasa (ponsel) sepekan setelah yang dipakai admin-booking.spec — hari yang tidak dipakai uji lain.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

function patientName(testInfo: TestInfo): string {
  return `Pasien Pengingat ${testInfo.project.name}`;
}

function rescheduleDate(testInfo: TestInfo): string {
  const date = new Date(`${upcomingWeekday(testInfo.project.name === "mobile" ? 2 : 1)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

/** wa.me dibalas lokal: uji tidak bergantung pada WhatsApp sungguhan. */
async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

async function clickAndClosePopup(page: Page, link: Locator) {
  const popup = page.waitForEvent("popup");
  await link.click();
  await (await popup).close();
}

function rowIn(page: Page, box: RegExp, name: string) {
  return page.getByRole("region", { name: box }).getByRole("listitem").filter({ hasText: name });
}

test("admin mengingatkan pasien, mencatat balasan, lalu memindah jadwalnya", async ({ page }, testInfo) => {
  const name = patientName(testInfo);
  await stubWhatsApp(page);
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/pengingat");

  if (testInfo.project.name !== "mobile") {
    // Menu samping tersembunyi di ponsel; di desktop angkanya tampil di menu Pengingat.
    await expect(page.getByLabel(/^\d+ pesan WhatsApp belum dikirim$/)).toBeVisible({ timeout: 30_000 });
  }

  // Kotak 2: ingatkan lewat WA.
  const remindRow = rowIn(page, /Ingatkan sekarang/, name);
  await expect(remindRow).toBeVisible({ timeout: 30_000 });
  const remindLink = remindRow.getByRole("link", { name: "Ingatkan via WA" });
  await expect(remindLink).toHaveAttribute("href", /^https:\/\/wa\.me\/628/);
  await clickAndClosePopup(page, remindLink);

  // Kotak 3: catat balasan, lalu ubah menjadi Minta pindah.
  const remindedRow = rowIn(page, /Sudah diingatkan/, name);
  await expect(remindedRow).toContainText("diingatkan", { timeout: 30_000 });
  await expect(rowIn(page, /Ingatkan sekarang/, name)).toHaveCount(0);
  await remindedRow.getByRole("button", { name: "Akan datang" }).click();
  await expect(remindedRow).toContainText("✓ Akan datang", { timeout: 30_000 });
  await remindedRow.getByRole("button", { name: "ubah" }).click();
  await remindedRow.getByRole("button", { name: "Minta pindah" }).click();
  await expect(remindedRow).toContainText("✓ Minta pindah", { timeout: 30_000 });

  // Pindah jadwal ke tanggal di luar strip memakai "Pilih tanggal lain".
  await remindedRow.getByRole("button", { name: "Pindah jadwal" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Pindah jadwal");
  await dialog.getByRole("button", { name: "Pilih tanggal lain" }).click();
  await dialog.getByLabel("Tanggal lain").fill(rescheduleDate(testInfo));
  const slots = dialog.getByRole("group", { name: "Pilih jam" }).getByRole("button");
  await expect(slots.nth(1)).toBeVisible({ timeout: 30_000 });
  const newTime = (await slots.nth(1).textContent())!;
  await slots.nth(1).click();
  await dialog.getByRole("button", { name: "Simpan jadwal baru" }).click();

  await expect(dialog.getByRole("link", { name: "Kirim konfirmasi jadwal baru via WA" })).toBeVisible({
    timeout: 30_000,
  });
  await dialog.getByRole("button", { name: "Tutup" }).click();

  // Konfirmasi untuk jadwal lama gugur: booking kembali ke kotak 1 dengan jadwal baru.
  const confirmRow = rowIn(page, /Konfirmasi belum dikirim/, name);
  await expect(confirmRow).toContainText(newTime, { timeout: 30_000 });
  await expect(rowIn(page, /Sudah diingatkan/, name)).toHaveCount(0);
});
