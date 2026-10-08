import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

test("resepsionis: kotak pekerjaan dan garis waktu, tanpa Angka dan daftar dokter", async ({ page }) => {
  await signIn(page, E2E_RESEPSIONIS);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Selamat (pagi|siang|sore|malam), /);
  await expect(page.getByRole("link", { name: /Menunggu konfirmasi/ })).toHaveAttribute("href", "/admin/booking");
  await expect(page.getByRole("link", { name: /Pesan WA belum dikirim/ })).toHaveAttribute("href", "/admin/pengingat");
  await expect(page.getByRole("region", { name: "Angka" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Pasien hari ini" })).toHaveCount(0);

  const timeline = page.getByRole("region", { name: "Jadwal hari ini" });
  await expect(timeline).toBeVisible();
  test.skip((await timeline.getByText(/^Klinik tutup hari ini/).count()) > 0, "Hari libur: tidak ada lajur.");

  // prepare-db membuat booking hari ini pukul 06.00–08.00 untuk dr. Diane, di luar jam kerjanya (Review Focus 1).
  const block = timeline.getByRole("link", { name: /^0[67]\.[03]0 Pasien · .+ · / }).first();
  await expect(block).toBeVisible();
  await block.click();
  await expect(page).toHaveURL(/\/admin\/booking\?tanggal=\d{4}-\d{2}-\d{2}&sorot=/, { timeout: 30_000 });
  await expect(page.locator('[role="row"][data-highlighted="true"]')).toHaveCount(1, { timeout: 30_000 });
});

test("slot kosong di garis waktu membuka Booking Baru yang sudah terisi", async ({ page }, testInfo) => {
  await stubWhatsApp(page);
  await signIn(page, E2E_ADMIN);
  const lane = page.getByRole("region", { name: "Jadwal hari ini" }).getByRole("listitem", { name: /^Jadwal Dr\. Diane/ });
  const slots = lane.getByRole("link", { name: /^Slot kosong/ });
  test.skip((await slots.count()) === 0, "Tidak ada slot kosong tersisa hari ini (hari libur, Minggu, atau malam).");

  // Ponsel memakai slot terakhir dan tidak membuat booking, agar dua proyek tidak merebut slot yang sama.
  const slot = testInfo.project.name === "mobile" ? slots.last() : slots.first();
  const time = /^Slot kosong (\d{2}\.\d{2})/.exec((await slot.getAttribute("aria-label"))!)![1];
  await slot.click();
  await expect(page).toHaveURL(/\/admin\/booking\/baru\?tenaga=.+&tanggal=.+&jam=/, { timeout: 30_000 });
  await expect(page.getByRole("group", { name: "Pilih jam" }).getByRole("button", { name: time })).toHaveAttribute(
    "aria-pressed",
    "true",
    { timeout: 30_000 },
  );
  await expect(page.getByRole("complementary", { name: "Ringkasan booking" })).toContainText(time);
  if (testInfo.project.name === "mobile") return;

  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  await page.getByLabel("Nama", { exact: true }).fill(`Pasien Dasbor ${Date.now().toString().slice(-6)}`);
  await page.getByLabel("Nomor WhatsApp").fill(`0813${Date.now().toString().slice(-8)}`);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Buat Booking" }).click();
  await expect(page.getByRole("heading", { name: /Booking SDY-[A-Z0-9]{4} dibuat/ })).toBeVisible({ timeout: 30_000 });
});
