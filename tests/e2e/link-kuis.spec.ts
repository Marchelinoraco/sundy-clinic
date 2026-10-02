import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { choose, fillFormRecall, inGroup, next, signIn, tick, upcomingWeekday } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Satu cerita per proyek: admin mencatat booking WA untuk pasien baru, customer mengisi kuis
// lewat link dari instruksi transfer. Jadwalnya Rabu (desktop) atau Kamis (ponsel) sepekan
// setelah yang dipakai public-registration.spec — hari yang tidak dipakai uji lain.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function bookingDate(testInfo: TestInfo): string {
  const date = new Date(`${upcomingWeekday(testInfo.project.name === "mobile" ? 4 : 3)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

test("customer mengisi kuis lewat link dari instruksi transfer", async ({ page, browser }, testInfo) => {
  const suffix = Date.now().toString().slice(-6);
  const patientName = `Sinta Link ${suffix}`;
  const date = bookingDate(testInfo);

  await stubWhatsApp(page);
  await signIn(page, E2E_ADMIN);
  await page.goto("/admin/booking/baru");
  await page.getByRole("button", { name: "+ Pasien Baru" }).click();
  await page.getByLabel("Nama", { exact: true }).fill(patientName);
  await page.getByLabel("Nomor WhatsApp").fill(`0812${suffix}55`);
  await page.getByRole("button", { name: "Buat Pasien" }).click();
  await expect(page.getByRole("button", { name: "Ganti pasien" })).toBeVisible({ timeout: 30_000 });

  await expect(page.locator("#booking-staff")).toContainText("Diane");
  await page.getByRole("button", { name: "Pilih tanggal lain" }).click();
  await page.getByLabel("Tanggal lain").fill(date);
  const slots = page.getByRole("group", { name: "Pilih jam" }).getByRole("button");
  await expect(slots.first()).toBeVisible({ timeout: 30_000 });
  await slots.first().click();
  await page.getByRole("button", { name: "Buat Booking" }).click();

  // Link kuis ikut instruksi transfer (spec C3 4.1), dengan kode setelah tanda #.
  const transfer = page.getByRole("link", { name: "Kirim instruksi transfer via WA" });
  await expect(transfer).toBeVisible({ timeout: 30_000 });
  const text = decodeURIComponent(new URL((await transfer.getAttribute("href"))!).searchParams.get("text")!);
  const link = /(https?:\/\/\S+\/isi#[A-Za-z0-9._-]+)/.exec(text)![1];
  expect(link.startsWith(`${E2E_BASE_URL}/isi#`)).toBe(true);

  // Dialog "Link kuis" di daftar booking menampilkan QR dan link yang sama.
  await page.getByRole("link", { name: /Lihat di daftar/ }).click();
  const row = page.locator('tr[data-highlighted="true"]');
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  // Belum ada baris isian, tetapi linknya berlaku (spec C3 4.3).
  await expect(row).toContainText("Isian: belum diisi");
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Link kuis" }).click();
  const dialog = page.getByRole("dialog", { name: /^Link kuis/ });
  await expect(dialog.getByRole("img", { name: "QR link kuis" })).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("link", { name: "Buka di perangkat ini" })).toHaveAttribute("href", link);
  await page.keyboard.press("Escape");

  // Customer: perangkat lain, tanpa login.
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const customerContext = await browser.newContext({
    viewport,
    userAgent,
    deviceScaleFactor,
    isMobile,
    hasTouch,
    baseURL: E2E_BASE_URL,
  });
  const customer = await customerContext.newPage();
  await customer.goto(link);
  await expect(customer.getByText("Halo Sinta")).toBeVisible({ timeout: 30_000 });
  await expect(customer.getByText("Pernah konsultasi atau treatment di SunDY Clinic?")).toHaveCount(0);

  await choose(customer, /^Slimming/);
  await choose(customer, "Menurunkan berat badan");
  await choose(customer, "5–10 kg");
  await tick(customer, "Perut");
  await next(customer);
  await choose(customer, "Belum pernah");
  await customer.getByLabel("Berat badan").fill("68");
  await customer.getByLabel("Tinggi badan").fill("160");
  await next(customer);
  await fillFormRecall(customer);
  await tick(customer, "Tidak ada");
  await next(customer);
  await inGroup(customer, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(customer, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(customer);
  await choose(customer, "Tidak");

  await expect(customer.getByRole("heading", { name: "Ringkasan jawaban Anda" })).toBeVisible();
  await expect(customer.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);
  await next(customer);

  await customer.getByLabel("Tanggal lahir").fill("1994-03-21");
  await inGroup(customer, "Jenis kelamin", "Perempuan");
  await customer.getByLabel("Pekerjaan").fill("Wiraswasta");
  await customer.getByLabel("Alamat").fill("Jl. Link E2E No. 3, Manado");
  await customer.getByRole("checkbox", { name: /Kebijakan Privasi/ }).check();
  await customer.getByRole("checkbox", { name: /mentransfer biaya booking/ }).check();
  await customer.getByRole("button", { name: "Kirim" }).click();
  await expect(customer.getByRole("heading", { name: "Terima kasih, sudah kami terima" })).toBeVisible({
    timeout: 30_000,
  });

  // Link yang sama sesudahnya hanya menampilkan terima kasih.
  await customer.reload();
  await expect(customer.getByRole("heading", { name: "Terima kasih, sudah kami terima" })).toBeVisible({
    timeout: 30_000,
  });
  await customerContext.close();

  // Admin: isian masuk dan menunggu diperiksa dokter.
  await page.reload();
  await expect(page.locator('tr[data-highlighted="true"]')).toContainText("Isian: belum diperiksa", {
    timeout: 30_000,
  });
});
