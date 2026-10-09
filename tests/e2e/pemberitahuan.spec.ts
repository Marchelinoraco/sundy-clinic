import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import { E2E_ADMIN, E2E_APOTEKER, E2E_KEUANGAN, E2E_RESEPSIONIS } from "./credentials";
import { signIn } from "./helpers/quiz";

// Tiga sesi bersamaan: Apoteker dan resepsionis membuka layarnya lebih dulu; dokter memfinalkan catatan di sesi lain.
// Keduanya harus tahu tanpa memuat ulang halaman (pemeriksaan tiap 10 detik).
test.setTimeout(240_000);

async function openAs(browser: Browser, testInfo: TestInfo, account: { email: string; password: string }, path: string): Promise<Page> {
  const context = await browser.newContext(testInfo.project.use);
  const page = await context.newPage();
  await signIn(page, account);
  await page.goto(path);
  return page;
}

async function examine(doctor: Page, patient: string, pharmacyNote: string | null) {
  await doctor.goto("/admin");
  await doctor.getByRole("region", { name: "Pasien hari ini" }).getByRole("row").filter({ hasText: patient }).getByRole("button", { name: "Periksa" }).click();
  await expect(doctor).toHaveURL(/\/admin\/kunjungan\/[^/]+$/, { timeout: 30_000 });
  await doctor.getByLabel("Penilaian / diagnosis").fill("Kontrol rutin");
  if (pharmacyNote) await doctor.getByLabel("Catatan untuk Apoteker").fill(pharmacyNote);
  await expect(doctor.getByText(/^Tersimpan \d{2}\.\d{2}$/)).toBeVisible({ timeout: 15_000 });
  await doctor.getByRole("button", { name: "Finalisasi" }).click();
  await doctor.getByRole("alertdialog").getByRole("button", { name: "Finalisasi" }).click();
  await expect(doctor.getByText("Final", { exact: true })).toBeVisible({ timeout: 30_000 });
}

test("resep dari dokter langsung diketahui Apoteker dan resepsionis; penyerahan dan siap ditagih diketahui resepsionis", async ({ browser }, testInfo) => {
  const project = testInfo.project.name;
  const withNote = `Pasien Notif A ${project}`;
  const withoutNote = `Pasien Notif B ${project}`;

  const pharmacist = await openAs(browser, testInfo, E2E_APOTEKER, "/admin/resep");
  const receptionist = await openAs(browser, testInfo, E2E_RESEPSIONIS, "/admin/tagihan");
  const doctor = await openAs(browser, testInfo, E2E_ADMIN, "/admin");
  await expect(pharmacist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();
  await expect(receptionist.getByRole("button", { name: /Bunyi notifikasi/ })).toBeVisible();
  await expect(pharmacist.getByRole("link", { name: withNote })).toHaveCount(0);

  // 1. Dokter memfinalkan dengan Catatan untuk Apoteker.
  await examine(doctor, withNote, "Amoxicillin 3x1 selama 5 hari");
  // Ditunggu bersamaan: toast hilang setelah 4 detik, dan pemeriksaan tiap halaman tidak serentak, sehingga
  // toast resepsionis bisa sudah hilang bila baru dicari setelah toast Apoteker muncul.
  await Promise.all([
    expect(pharmacist.getByText(`Resep baru: ${withNote}`)).toBeVisible({ timeout: 40_000 }),
    expect(receptionist.getByText(`Resep baru: ${withNote}`)).toBeVisible({ timeout: 40_000 }),
  ]);
  // Antrean Apoteker terbarui tanpa muat ulang halaman.
  await expect(pharmacist.getByRole("link", { name: withNote })).toBeVisible({ timeout: 20_000 });

  // 2. Apoteker menandai tanpa obat; resepsionis langsung tahu.
  await pharmacist.getByRole("link", { name: withNote }).click();
  await expect(pharmacist).toHaveURL(/\/admin\/resep\/[^/?]+$/, { timeout: 30_000 });
  await pharmacist.getByRole("button", { name: "Tanpa obat" }).click();
  await expect(receptionist.getByText(`Tanpa obat: ${withNote}`)).toBeVisible({ timeout: 40_000 });

  // 3. Catatan final tanpa resep: hanya resepsionis yang diberi tahu.
  await examine(doctor, withoutNote, null);
  await expect(receptionist.getByText(`Siap ditagih: ${withoutNote}`)).toBeVisible({ timeout: 40_000 });
  await expect(pharmacist.getByText(`Siap ditagih: ${withoutNote}`)).toHaveCount(0);

  // 4. Tombol bunyi bisa dimatikan dan pilihan bertahan setelah muat ulang.
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
