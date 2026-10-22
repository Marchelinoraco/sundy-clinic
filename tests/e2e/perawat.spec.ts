import { expect, test, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_PERAWAT, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Booking hari ini dari prepare-db.mts (E2E-PERAWAT-1/2), satu per proyek agar desktop dan ponsel tidak berebut.
test.setTimeout(240_000);

const projectIndex = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? 2 : 1);

test("resepsionis check-in → perawat diberi tahu, mengisi angka vital, food recall, dan BIA → dokter menunggu perawat, lalu memeriksa dan memfinalkan", async ({ page, browser }, testInfo) => {
  const n = projectIndex(testInfo);
  const code = `E2E-PERAWAT-${n}`;
  const patientName = `Pasien Perawat ${testInfo.project.name}`;
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const newContext = () => browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL: E2E_BASE_URL });

  // Perawat masuk lebih dulu dan menunggu di Dasbor: menunya hanya Dasbor (spec peran perawat 5).
  const nurseContext = await newContext();
  const nurse = await nurseContext.newPage();
  await signIn(nurse, E2E_PERAWAT);
  if (testInfo.project.name === "mobile") await nurse.getByRole("button", { name: "Buka menu" }).click();
  await expect(nurse.getByRole("link", { name: "Dasbor" }).first()).toBeVisible();
  await expect(nurse.getByRole("link", { name: "Booking" })).toHaveCount(0);
  await expect(nurse.getByRole("link", { name: "Tagihan" })).toHaveCount(0);
  if (testInfo.project.name === "mobile") await nurse.keyboard.press("Escape");
  // Sentuhan pertama menyalakan bunyi; pemberitahuan tetap tampil tanpa bunyi.
  await nurse.locator("main").click({ position: { x: 5, y: 5 } });

  // Resepsionis meng-check-in tanpa food recall.
  const reception = page;
  await signIn(reception, E2E_RESEPSIONIS);
  await reception.goto("/admin/booking");
  const bookingRow = reception.getByRole("row").filter({ hasText: code });
  await expect(bookingRow).toBeVisible({ timeout: 60_000 });
  await bookingRow.getByRole("button", { name: "Check-in" }).click();
  const dialog = reception.getByRole("dialog", { name: `Check-in — ${code}` });
  await expect(dialog.getByRole("button", { name: "Check-in" })).toBeVisible({ timeout: 30_000 });
  await dialog.getByLabel("NIK (16 angka)").fill(`717101570590003${n}`);
  await expect(dialog.getByLabel("Tawarkan food recall")).not.toBeChecked();
  await dialog.getByRole("button", { name: "Check-in" }).click();
  await expect(reception.getByText(`${patientName} sudah check-in.`).first()).toBeVisible({ timeout: 30_000 });

  // Perawat diberi tahu tanpa muat ulang, lalu pasiennya muncul di daftar (spec peran perawat 9).
  await expect(nurse.getByText(`Pasien check-in: ${patientName}`)).toBeVisible({ timeout: 40_000 });
  const row = nurse.getByRole("region", { name: "Pasien hari ini" }).getByRole("row").filter({ hasText: patientName });
  await expect(row).toBeVisible({ timeout: 30_000 });
  const tangani = row.getByRole("link", { name: `Tangani ${patientName}` });
  const href = await tangani.getAttribute("href");
  expect(href).toMatch(/^\/admin\/perawat\/.+$/);
  await tangani.click();
  await expect(nurse).toHaveURL(new RegExp(`${href}$`), { timeout: 60_000 });
  await expect(nurse.getByRole("heading", { name: patientName })).toBeVisible();
  await expect(nurse.getByRole("region", { name: "Peringatan" })).toContainText("Udang");

  // Angka vital oleh perawat, tersimpan otomatis (spec vital perawat VP1, VP2).
  const vitals = nurse.getByRole("region", { name: "Angka vital" });
  await vitals.getByLabel("Berat badan (kg)").fill("65,5");
  await expect(vitals.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });

  // Food recall oleh perawat.
  const foodRecall = nurse.getByRole("region", { name: "Food recall" });
  await foodRecall.getByRole("button", { name: "Isi food recall" }).click();
  await foodRecall.getByLabel("Isi catatan").fill("Nasi uduk dan teh manis");
  await foodRecall.getByRole("button", { name: "＋ Tambah catatan" }).click();
  await foodRecall.getByRole("button", { name: "Simpan food recall" }).click();
  await expect(nurse.getByText("Food recall disimpan.")).toBeVisible({ timeout: 30_000 });
  await expect(foodRecall.getByText("perawat", { exact: true })).toBeVisible({ timeout: 30_000 });

  // BIA tanpa berkas: angka diketik perawat.
  const bia = nurse.getByRole("region", { name: "BIA" });
  await bia.getByRole("button", { name: "Isi angka tanpa berkas" }).click();
  await bia.getByLabel("Lemak tubuh (%)").fill("28,5");
  await bia.getByRole("button", { name: "Simpan angka BIA" }).click();
  await expect(nurse.getByText("Angka BIA tersimpan.")).toBeVisible({ timeout: 30_000 });

  // Dokter (Super Admin uji) belum bisa memeriksa selama perawat belum selesai menangani (spec vital perawat VP4).
  const doctorContext = await newContext();
  const doctor = await doctorContext.newPage();
  await signIn(doctor, E2E_ADMIN);
  const todayRow = doctor.getByRole("region", { name: "Pasien hari ini" }).getByRole("row").filter({ hasText: patientName });
  await expect(todayRow).toContainText("Menunggu perawat", { timeout: 30_000 });
  await expect(todayRow.getByRole("button", { name: "Periksa" })).toBeDisabled();

  // Selesai ditangani mengunci angka vital dan mencatat nama perawat dari akunnya (VP3, VP6).
  await vitals.getByRole("button", { name: "Selesai ditangani" }).click();
  await nurse.getByRole("dialog", { name: "Selesaikan penanganan?" }).getByRole("button", { name: "Selesai ditangani" }).click();
  await expect(vitals.getByText(new RegExp(`^Ditangani ${E2E_PERAWAT.name} · \\d{2}\\.\\d{2}$`))).toBeVisible({ timeout: 30_000 });
  await expect(vitals.getByText("Berat badan: 65,5 kg")).toBeVisible();
  await expect(vitals.getByLabel("Berat badan (kg)")).toHaveCount(0);

  // Dokter melihat angka dari perawat di bagian O, penulis food recall, dan pengisi angka BIA, lalu memfinalkan.
  await doctor.reload();
  await todayRow.getByRole("button", { name: "Periksa" }).click();
  await expect(doctor).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 60_000 });
  await expect(doctor.getByLabel("Berat badan (kg)")).toHaveValue("65,5");
  await expect(doctor.getByText(new RegExp(`^Diukur perawat ${E2E_PERAWAT.name} · \\d{2}\\.\\d{2}$`))).toBeVisible();
  await doctor.getByRole("tab", { name: "Food recall" }).click();
  await expect(doctor.getByRole("tabpanel")).toContainText("Nasi uduk dan teh manis");
  await expect(doctor.getByRole("tabpanel").getByText("perawat", { exact: true })).toBeVisible();
  await doctor.getByRole("tab", { name: "BIA" }).click();
  await expect(doctor.getByRole("tabpanel", { name: "BIA" })).toContainText(`angka oleh ${E2E_PERAWAT.name}`);
  await doctor.getByLabel("Penilaian / diagnosis").fill("Obesitas derajat 1");
  await expect(doctor.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await doctor.getByRole("button", { name: "Finalisasi" }).click();
  await doctor.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(doctor.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
  await doctorContext.close();

  // Setelah final, halaman Tangani tertutup bagi perawat, dan perawat tetap tidak membuka tagihan.
  await nurse.goto(href!);
  await expect(nurse.getByText("Pasien ini tidak sedang ditangani hari ini.")).toBeVisible({ timeout: 30_000 });
  expect((await nurse.goto("/admin/tagihan"))?.status()).toBe(403);
  await nurseContext.close();
});
