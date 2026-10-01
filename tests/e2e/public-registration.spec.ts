import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { choose, fillFormRecall, inGroup, next, signIn, tick, upcomingWeekday } from "./helpers/quiz";

// Satu cerita berurutan: pasien mendaftar → admin mencocokkan & memverifikasi
// → resepsionis tidak melihat isi klinis → pasien membatalkan. Proyek desktop
// dan ponsel berjalan paralel, masing-masing dengan hari dan pasien sendiri.
// admin-booking.spec memakai Senin & Selasa; berkas ini Rabu & Kamis.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

function bookingDate(testInfo: TestInfo): string {
  return upcomingWeekday(testInfo.project.name === "mobile" ? 4 : 3);
}

function patientFor(testInfo: TestInfo) {
  return testInfo.project.name === "mobile"
    ? { name: "Pasien Ponsel E2E", whatsapp: "081299990002" }
    : { name: "Pasien Desktop E2E", whatsapp: "081299990001" };
}

let booking: { code: string; date: string } | null = null;
let intakeUrl: string | null = null;
let patientUrl: string | null = null;

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
  await fillFormRecall(page);
  await tick(page, "Darah tinggi");
  await next(page);
  await page.getByLabel("Obat untuk Darah tinggi").fill("Amlodipine 5 mg, 1× sehari");
  await next(page);
  await inGroup(page, "Obat atau suplemen lain", "Tidak ada");
  await inGroup(page, "Alergi obat, makanan, atau kosmetik", "Tidak ada");
  await next(page);
  await choose(page, "Tidak");

  await expect(page.getByRole("heading", { name: "Ringkasan jawaban Anda" })).toBeVisible();
  await expect(page.getByText("Slimming · pertama kali ke SunDY")).toBeVisible();
  await expect(page.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);
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
  // Booking situs langsung terlihat di daftar "menunggu konfirmasi" tanpa membuka tanggal jadwalnya.
  await page.goto("/admin/booking");
  const pending = page.getByRole("region", { name: /^Menunggu konfirmasi/ });
  const pendingRow = pending.getByRole("row").filter({ hasText: booking!.code });
  await expect(pendingRow.getByText(/^Kedaluwarsa /)).toBeVisible();
  if (testInfo.project.name !== "mobile") {
    // Menu samping tersembunyi di ponsel; di desktop angkanya tampil di menu Booking.
    await expect(page.getByLabel(/^\d+ booking menunggu konfirmasi$/)).toBeVisible();
  }

  await expect(pendingRow.getByText("Belum dicocokkan", { exact: true })).toBeVisible();
  await pendingRow.getByRole("button", { name: "Cocokkan pasien" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(patientFor(testInfo).name).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Buat pasien baru" }).click();
  await expect(pendingRow.getByText("Belum dicocokkan", { exact: true })).toBeHidden({ timeout: 30_000 });

  await pendingRow.getByRole("button", { name: "Verifikasi" }).click();
  // Setelah diverifikasi booking keluar dari daftar menunggu, tetapi tetap ada di tanggal jadwalnya.
  await expect(pendingRow).toHaveCount(0, { timeout: 30_000 });
  // Isian terisi tampil di filter "belum diperiksa" dari tanggal mana pun.
  await page.goto("/admin/booking?isian=belum-diperiksa");
  const row = page.getByRole("row").filter({ hasText: booking!.code });
  await expect(row.getByText("Isian: belum diperiksa")).toBeVisible();
  await expect(row.getByText("Terkonfirmasi", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await page.getByRole("menuitem", { name: "Lihat isian" }).click();
  // Rute /admin/isian/[id] belum pernah dikompilasi next dev di uji manapun
  // sebelumnya; dengan worker paralel navigasi pertama bisa lebih lambat
  // dari batas waktu bawaan (lihat catatan di playwright.config.ts).
  await expect(page.getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("72 kg · 158 cm · IMT 28,8")).toBeVisible();
  const habits = page.getByRole("table", { name: "Kebiasaan sehari" });
  await expect(habits.getByRole("row").filter({ hasText: "07.00" })).toContainText(
    "Sarapan: Nasi kuning 1 piring, teh manis 1 gelas",
  );
  intakeUrl = page.url();

  // Super Admin memegang record:write: menyetujui ke data pasien dengan sedikit suntingan.
  const approval = page.getByRole("region", { name: "Setujui ke data pasien" });
  await expect(approval.getByLabel("Alergi", { exact: true })).toHaveValue("Tidak ada");
  const history = approval.getByLabel("Riwayat penyakit & obat", { exact: true });
  await expect(history).toHaveValue("Darah tinggi: Amlodipine 5 mg, 1× sehari");
  await history.fill("Darah tinggi: Amlodipine 5 mg, 1× sehari (kontrol rutin)");
  await approval.getByRole("button", { name: "Setujui ke data pasien" }).click();
  await expect(page.getByText("Sudah diperiksa dokter")).toBeVisible({ timeout: 30_000 });

  await page.getByRole("link", { name: new RegExp(`^${patientFor(testInfo).name} \\(`) }).click();
  // Halaman isian yang baru dimuat ulang juga memuat teks ini (catatan saat ini dan kolom sunting),
  // jadi tunggu halaman pasien terbuka dulu, lalu cari di bagian catatan medisnya.
  await expect(page).toHaveURL(/\/admin\/pasien\/[^/]+$/, { timeout: 30_000 });
  await expect(
    page.getByRole("region", { name: "Catatan medis" }).getByText("Darah tinggi: Amlodipine 5 mg, 1× sehari (kontrol rutin)"),
  ).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: booking!.code }).first()).toBeVisible();
  patientUrl = page.url();

  // Setelah disetujui, booking ini keluar dari filter "belum diperiksa".
  await page.goto("/admin/booking?isian=belum-diperiksa");
  await expect(page.getByRole("row").filter({ hasText: booking!.code })).toHaveCount(0);
});

test("resepsionis melihat booking tanpa isi klinis isian", async ({ page }, testInfo) => {
  test.skip(!booking || !intakeUrl || !patientUrl, "Butuh booking, isian, dan pasien dari uji sebelumnya.");
  await signIn(page, E2E_RESEPSIONIS);
  await page.goto(`/admin/booking?tanggal=${booking!.date}`);

  const row = page.getByRole("row").filter({ hasText: booking!.code });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /^Aksi lain/ }).click();
  await expect(page.getByRole("menuitem", { name: "Batalkan" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Lihat isian" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto(intakeUrl!);
  await expect(page.getByText(/Amlodipine/)).toHaveCount(0);

  await page.goto(patientUrl!);
  await expect(page.getByText(patientFor(testInfo).name).first()).toBeVisible();
  await expect(page.getByText(/Amlodipine/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Lihat isian" })).toHaveCount(0);
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
