import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";

// Tiga sesi bersamaan: Apoteker dan resepsionis membuka layarnya lebih dulu; dokter memfinalkan catatan di sesi lain.
// Resepsionis harus tahu tanpa memuat ulang halaman (pemeriksaan tiap 10 detik). Resep dokter tidak lagi melewati
// Apoteker (spec resep dokter 6), jadi Apoteker tidak menerima "Resep baru".
test.setTimeout(240_000);

async function openAs(browser: Browser, testInfo: TestInfo, account: { email: string; password: string }, path: string): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use);
  const page = await context.newPage();
  await signIn(page, account);
  await page.goto(path);
  return page;
}

async function examine(doctor: Page, patient: string) {
  await doctor.goto("/admin");
  await doctor.getByRole("region", { name: "Pasien hari ini" }).getByRole("row").filter({ hasText: patient }).getByRole("button", { name: "Periksa" }).click();
  await expect(doctor).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await doctor.getByLabel("Penilaian / diagnosis").fill("Kontrol rutin");
  await expect(doctor.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await doctor.getByRole("button", { name: "Finalisasi" }).click();
  await doctor.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(doctor.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
}

test("catatan final diketahui resepsionis tanpa muat ulang; Apoteker tidak menerima resep baru", async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const patient = `Pasien Notif A ${project}`;

  const pharmacist = await openAs(browser, testInfo, E2E_APOTEKER, "/admin/resep");
  const receptionist = await openAs(browser, testInfo, E2E_RESEPSIONIS, "/admin/tagihan");
  const doctor = await openAs(browser, testInfo, E2E_ADMIN, "/admin");
  await expect(pharmacist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();
  await expect(receptionist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();

  await examine(doctor, patient);
  await expect(receptionist.getByText(`Siap ditagih: ${patient}`)).toBeVisible({ timeout: 40_000 });
  await expect(pharmacist.getByText(`Resep baru: ${patient}`)).toHaveCount(0);
  await expect(pharmacist.getByText(`Siap ditagih: ${patient}`)).toHaveCount(0);

  await receptionist.getByRole("button", { name: "Bunyi notifikasi hidup" }).click();
  await expect(receptionist.getByRole("button", { name: "Bunyi notifikasi mati" })).toBeVisible();
  await receptionist.reload();
  await expect(receptionist.getByRole("button", { name: "Bunyi notifikasi mati" })).toBeVisible();

  await Promise.all([pharmacist.context().close(), receptionist.context().close(), doctor.context().close()]);
});

test("peran tanpa pemberitahuan tidak punya tombol bunyi", async ({ browser }, testInfo) => {
  const keuangan = await openAs(browser, testInfo, E2E_KEUANGAN, "/admin");
  await expect(keuangan.getByRole("button", { name: /Bunyi notifikasi/ })).toHaveCount(0);
  await keuangan.context().close();
});
