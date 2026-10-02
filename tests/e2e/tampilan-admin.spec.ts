import { expect, test } from "@playwright/test";
import { E2E_ADMIN } from "./credentials";
import { signIn } from "./helpers/quiz";

test.setTimeout(180_000);

// Satu judul besar per halaman (spec D 3.1): bar atas tidak lagi memakai <h1>.
const PAGES: [string, RegExp][] = [
  ["/admin", /^Selamat (pagi|siang|sore|malam), /],
  ["/admin/booking", /^Booking$/],
  ["/admin/booking/baru", /^Booking Baru$/],
  ["/admin/pengingat", /^Pengingat$/],
  ["/admin/pasien", /^Pasien$/],
  ["/admin/jadwal", /^Jadwal$/],
  ["/admin/layanan", /^Layanan & Harga$/],
  ["/admin/staf", /^Staf$/],
  ["/admin/pengaturan", /^Pengaturan$/],
];

test("setiap halaman admin punya tepat satu judul besar, tanpa gulir mendatar di ponsel", async ({ page }, testInfo) => {
  await signIn(page, E2E_ADMIN);
  for (const [path, title] of PAGES) {
    await page.goto(path);
    const headings = page.getByRole("heading", { level: 1 });
    await expect(headings).toHaveCount(1, { timeout: 30_000 });
    await expect(headings).toHaveText(title);
    if (testInfo.project.name === "mobile") {
      // Spec D 3.3: tabel boleh digulir di dalam kartunya, halaman tidak.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${path} melebar ${overflow}px`).toBeLessThanOrEqual(1);
    }
  }
});
