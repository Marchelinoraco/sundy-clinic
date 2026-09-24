import { expect, test } from "@playwright/test";

test("beranda menampilkan identitas klinik dan layanan signature", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("SunDY");
  await expect(page.getByRole("heading", { name: "Our Signature Treatment" })).toBeVisible();
});

test("pengunjung dapat menelusuri dari beranda ke detail layanan", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Lihat Layanan & Harga" }).click();
  await expect(page).toHaveURL(/\/layanan$/);

  await page.getByRole("link", { name: "HIFU Wajah", exact: true }).first().click();
  await expect(page).toHaveURL(/\/layanan\/hifu-wajah$/);

  // Dipersempit ke <main>: judul halaman juga memuat harga dan ikut terbaca
  // di route announcer Next, yang membuat pencocokan teks jadi ambigu.
  const main = page.locator("main");

  // Harga coret dan harga promo harus muncul berdampingan, bukan salah satunya.
  await expect(main.getByText("Rp 749.000")).toBeVisible();
  await expect(main.getByText("Rp 499.000")).toBeVisible();
});

test("halaman program slimming menampilkan ketiga kelompok paket", async ({ page }) => {
  await page.goto("/program-slimming");
  await expect(page.getByRole("heading", { name: "Paket MAX" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paket LUX" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paket ACTIVE" })).toBeVisible();
});

test("LUX T ACTIVE memakai Kapsul L, bukan Kapsul M", async ({ page }) => {
  // Materi promosi klinik menulis Kapsul M di sini. Koreksinya harus sampai
  // ke halaman yang dilihat pasien, bukan berhenti di basis data.
  await page.goto("/program-slimming");
  const card = page.locator("article").filter({ hasText: "LUX T ACTIVE" });
  await expect(card).toContainText("Kapsul L");
  await expect(card).not.toContainText("Kapsul M");
});

test("cabang Citraland ditandai segera hadir dan tidak menawarkan petunjuk arah", async ({
  page,
}) => {
  await page.goto("/lokasi/citraland");
  await expect(page.getByText("Segera Hadir")).toBeVisible();
  await expect(page.getByRole("link", { name: /beri tahu saya saat buka/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /petunjuk arah/i })).toHaveCount(0);
});

test("tombol WhatsApp mengambang tersedia di seluruh halaman", async ({ page }) => {
  for (const path of ["/", "/layanan", "/produk", "/lokasi", "/faq"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: /chat via whatsapp/i })).toBeVisible();
  }
});

test("halaman produk menautkan ke WhatsApp dengan nama produk terisi", async ({ page }) => {
  await page.goto("/produk");
  const link = page.getByRole("link", { name: "Pesan via WhatsApp" }).first();
  const href = await link.getAttribute("href");

  expect(href).toContain("wa.me/6285172228900");
  expect(decodeURIComponent(href ?? "")).toContain("Kapsul M");
});

test("tidak ada guliran horizontal di lebar ponsel", async ({ page }) => {
  for (const path of ["/", "/layanan", "/program-slimming", "/lokasi"]) {
    await page.goto(path);
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows, `halaman ${path} menggulir ke samping`).toBe(false);
  }
});

test("setiap halaman publik punya judul yang berbeda", async ({ page }) => {
  const titles = new Set<string>();

  for (const path of ["/", "/layanan", "/program-slimming", "/produk", "/lokasi", "/tentang"]) {
    await page.goto(path);
    titles.add(await page.title());
  }

  expect(titles.size).toBe(6);
});
