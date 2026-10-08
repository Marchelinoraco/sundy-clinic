import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";
import { E2E_BASE_URL } from "./test-env";

// Booking hari ini dari prepare-db.mts, satu per proyek agar desktop dan ponsel tidak berebut.
test.setTimeout(180_000);

const projectIndex = (testInfo: TestInfo) => (testInfo.project.name === "mobile" ? 2 : 1);

async function stubWhatsApp(page: Page) {
  await page
    .context()
    .route("https://wa.me/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "WhatsApp" }));
}

/** Booking terkonfirmasi hari ini hanya ada di daftar tanggal (bukan di "Menunggu konfirmasi"). */
async function openCheckIn(page: Page, code: string) {
  await page.goto("/admin/booking");
  const row = page.getByRole("row").filter({ hasText: code });
  await row.getByRole("button", { name: "Check-in" }).click();
  const dialog = page.getByRole("dialog", { name: `Check-in — ${code}` });
  await expect(dialog.getByRole("button", { name: "Check-in" })).toBeVisible({ timeout: 30_000 });
  return { row, dialog };
}

test("resepsionis check-in dengan NIK, customer mengisi food recall di tablet, dokter menyalinnya ke S lalu memfinalisasi", async ({
  page,
  browser,
}, testInfo) => {
  const n = projectIndex(testInfo);
  const code = `E2E-CEKIN-${n}`;
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = testInfo.project.use;
  const newContext = () => browser.newContext({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, baseURL: E2E_BASE_URL });
  await stubWhatsApp(page);
  await signIn(page, E2E_RESEPSIONIS);

  // Resepsionis: NIK ditempel dari foto KTP dengan spasi (Review Focus 1).
  const { row, dialog } = await openCheckIn(page, code);
  await dialog.getByLabel("NIK (16 angka)").fill(`7171 0157 0590 001${n}`);
  await expect(dialog.getByLabel("Tawarkan food recall")).toBeChecked();
  await dialog.getByRole("button", { name: "Check-in" }).click();

  const openOnTablet = dialog.getByRole("link", { name: "Buka di tablet" });
  await expect(openOnTablet).toBeVisible({ timeout: 30_000 });
  const link = (await openOnTablet.getAttribute("href"))!;
  expect(link.startsWith(`${E2E_BASE_URL}/food-recall#`)).toBe(true);
  await dialog.getByRole("button", { name: "Selesai" }).click();
  await expect(row).toContainText("Food recall: belum diisi", { timeout: 30_000 });

  // Customer di tablet: perangkat lain, tanpa login.
  const tabletContext = await newContext();
  const tablet = await tabletContext.newPage();
  await tablet.goto(link);
  await expect(tablet.getByText("Halo Rani,")).toBeVisible({ timeout: 30_000 });
  await tablet.getByLabel("Isi catatan").fill("Nasi kuning dan teh manis");
  await tablet.getByRole("button", { name: "＋ Tambah catatan" }).click();
  await tablet.getByRole("button", { name: "Kirim" }).click();
  await expect(tablet.getByText("Terima kasih, dokter akan melihatnya saat konsultasi.")).toBeVisible({ timeout: 30_000 });
  await expect(tablet.locator("main").getByText(/pasien|berobat/i)).toHaveCount(0);

  // Resepsionis hanya melihat statusnya, tanpa isi (spec 4.4).
  await page.reload();
  await expect(row).toContainText("Food recall: sudah diisi", { timeout: 30_000 });
  await expect(page.getByText("Nasi kuning dan teh manis")).toHaveCount(0);

  // Dokter (sesi sendiri): tanda di daftar pasien hari ini, tab Food recall terbuka pertama.
  const doctorContext = await newContext();
  const doctor = await doctorContext.newPage();
  await signIn(doctor, E2E_ADMIN);
  const todayRow = doctor
    .getByRole("region", { name: "Pasien hari ini" })
    .getByRole("row")
    .filter({ hasText: `Rani Cekin ${testInfo.project.name}` });
  await expect(todayRow).toContainText("food recall ✓", { timeout: 30_000 });
  await todayRow.getByRole("button", { name: "Periksa" }).click();
  // 60 dtk: halaman kunjungan dikompilasi `next dev` saat pertama dibuka, sementara spek lain ikut berjalan.
  await expect(doctor).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 60_000 });
  await expect(doctor.getByRole("tab", { name: "Food recall" })).toHaveAttribute("aria-selected", "true");
  await expect(doctor.getByRole("tabpanel")).toContainText("Nasi kuning dan teh manis");

  await doctor.getByRole("tabpanel").getByRole("button", { name: "Salin ke S" }).click();
  await expect(doctor.getByText("Food recall disalin ke S.")).toBeVisible();
  await expect(doctor.getByLabel("Keluhan dan anamnesis dokter")).toHaveValue(
    /^Food recall H-1 \(.+\):\n07\.00 Makan\/minum — Nasi kuning dan teh manis$/,
  );

  await doctor.getByLabel("Penilaian / diagnosis").fill("Obesitas derajat 1");
  await expect(doctor.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await doctor.getByRole("button", { name: "Finalisasi" }).click();
  await doctor.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(doctor.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
  await doctorContext.close();

  // Setelah final, link customer hanya mengabarkan bahwa catatannya sudah diterima.
  await tablet.reload();
  await expect(tablet.getByText("Food recall Anda sudah diterima dokter.")).toBeVisible({ timeout: 30_000 });
  await expect(tablet.getByRole("button", { name: "Kirim" })).toHaveCount(0);
  await tabletContext.close();
});

test("resepsionis memindah pasien rangkap ke pemilik NIK, lalu check-in tanpa food recall", async ({ page }, testInfo) => {
  const n = projectIndex(testInfo);
  const code = `E2E-GABUNG-${n}`;
  const owner = `Rina Lama ${testInfo.project.name}`;
  await signIn(page, E2E_RESEPSIONIS);

  const { row, dialog } = await openCheckIn(page, code);
  await dialog.getByLabel("NIK (16 angka)").fill(`7171.0157.0590.002${n}`);
  await dialog.getByRole("button", { name: "Check-in" }).click();

  await expect(dialog.getByRole("heading", { name: "NIK ini sudah milik pasien lain" })).toBeVisible({ timeout: 30_000 });
  await expect(dialog).toContainText(`SDY-E2E-NIK-${n}`);
  await dialog.getByRole("button", { name: "Ini orang yang sama — pindahkan" }).click();
  await expect(page.getByText(`Booking dipindah ke ${owner} (SDY-E2E-NIK-${n}).`)).toBeVisible({ timeout: 30_000 });

  // Dialog kini memuat pasien lama: NIK-nya sudah ada, dan tanpa isian Slimming food recall tidak dicentang.
  await expect(dialog.getByText(`NIK 717101570590002${n}`)).toBeVisible();
  await expect(dialog.getByLabel("Tawarkan food recall")).not.toBeChecked();
  await dialog.getByRole("button", { name: "Check-in" }).click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expect(row).toContainText("Hadir", { timeout: 30_000 });
  await expect(row).toContainText(owner);
});
