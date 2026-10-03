import { expect, test } from "@playwright/test";

/** Semua halaman publik, termasuk yang hanya mendapat header, footer, dan transisi baru. */
const PUBLIC_PATHS = [
  "/",
  "/layanan",
  "/layanan/hifu-wajah",
  "/program-slimming",
  "/produk",
  "/lokasi",
  "/lokasi/mahakeret",
  "/lokasi/citraland",
  "/tentang",
  "/faq",
  "/kebijakan-privasi",
  "/syarat-ketentuan",
  "/daftar",
  "/cek-booking",
];

test("tidak ada halaman publik yang menggulir ke samping", async ({ page }) => {
  test.setTimeout(180_000);
  for (const path of PUBLIC_PATHS) {
    await page.goto(path);
    // Sampai bawah dulu, supaya bentuk hiasan dan kartu di bawah layar ikut terukur.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `halaman ${path} menggulir ke samping`).toBe(false);
  }
});

test("elemen di bawah layar menunggu, lalu muncul saat digulir sampai", async ({ page }) => {
  await page.goto("/");
  const armed = page.locator('[data-reveal="armed"]');
  await expect.poll(() => armed.count()).toBeGreaterThan(0);

  const element = await armed.first().elementHandle();
  await element!.scrollIntoViewIfNeeded();
  await expect.poll(() => element!.getAttribute("data-reveal")).toBe("shown");
});

test("saat dicetak, isi yang belum muncul tetap tercetak", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator('[data-reveal="armed"]').count()).toBeGreaterThan(0);
  await page.emulateMedia({ media: "print" });
  const invisible = await page
    .locator('[data-reveal="armed"]')
    .evaluateAll((elements) => elements.filter((element) => getComputedStyle(element).opacity !== "1").length);
  expect(invisible).toBe(0);
});

test.describe("dengan kurangi gerakan", () => {
  test.use({ reducedMotion: "reduce" });

  test("isi Beranda, Layanan, dan Program Slimming langsung terlihat tanpa animasi", async ({ page }) => {
    for (const path of ["/", "/layanan", "/program-slimming"]) {
      await page.goto(path);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      // Beri waktu hidrasi; elemen tidak boleh pernah menunggu.
      await page.waitForTimeout(800);
      await expect(page.locator('[data-reveal="armed"]'), path).toHaveCount(0);
      await expect(page.locator('[data-parallax="aktif"]'), path).toHaveCount(0);
      const running = await page.evaluate(
        () =>
          document
            .getAnimations()
            .filter((animation) => animation.playState === "running")
            // Indikator dev Next.js ada di shadow DOM-nya sendiri; yang dihitung hanya isi situs.
            .filter((animation) => {
              const target = (animation.effect as KeyframeEffect | null)?.target;
              return target instanceof Element && target.getRootNode() === document;
            }).length,
      );
      expect(running, `animasi masih berjalan di ${path}`).toBe(0);
    }
  });
});

test("chip kategori Layanan menggulir ke kategorinya dan ikut menyala", async ({ page }) => {
  await page.goto("/layanan");
  const nav = page.getByRole("navigation", { name: "Kategori layanan" });
  await nav.getByRole("link", { name: "HIFU Treatment" }).click();

  await expect(page).toHaveURL(/#bagian-hifu$/);
  await expect(page.getByRole("heading", { level: 2, name: "HIFU Treatment" })).toBeInViewport();
  await expect(nav.getByRole("link", { name: "HIFU Treatment" })).toHaveAttribute("aria-current", "true");
});

test("tautan ?paket=lux langsung membuka paket LUX", async ({ page }) => {
  await page.goto("/program-slimming?paket=lux");
  await expect(page.getByRole("tab", { name: "LUX" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paket MAX" })).toBeHidden();
});

test("menu ponsel terbuka, berpindah halaman, dan tertutup", async ({ page, isMobile }) => {
  test.skip(!isMobile, "menu garis tiga hanya tampil di ponsel");
  await page.goto("/");
  await page.getByRole("button", { name: "Buka menu" }).click();
  const menu = page.getByRole("dialog", { name: "Menu" });
  await expect(menu).toBeVisible();

  await menu.getByRole("link", { name: "Produk" }).click();
  await expect(page).toHaveURL(/\/produk$/);
  await expect(menu).toBeHidden();

  await page.getByRole("button", { name: "Buka menu" }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("bar booking menempel di bawah layar ponsel setelah tombol utama terlewati", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "bar bawah hanya untuk ponsel");
  await page.goto("/layanan/hifu-wajah");
  const bar = page.locator("[data-sticky-booking-bar]");
  await expect(bar).toHaveAttribute("data-visible", "false");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(bar).toHaveAttribute("data-visible", "true");
  await expect(bar).toContainText("Rp 499.000");
  await expect(bar.getByRole("link", { name: "Daftar" })).toBeVisible();

  // Tombol WhatsApp melayang naik supaya tidak menutupi bar.
  const fab = page.getByRole("link", { name: /chat via whatsapp/i });
  await expect
    .poll(async () => {
      const [fabBox, barBox] = await Promise.all([fab.boundingBox(), bar.boundingBox()]);
      return fabBox && barBox ? fabBox.y + fabBox.height <= barBox.y + 1 : false;
    })
    .toBe(true);
});
