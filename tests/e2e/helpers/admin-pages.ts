import type { Page } from "@playwright/test";

/** Halaman detail dicari lewat tautan pertama (`link`) di halaman `from`, atau lewat halaman perantara (`via`). */
export type AdminPage = { path: string; from?: string; via?: string; link?: string };

/** Ke-26 halaman panel admin (spec MUI 1). `/masuk` diuji terpisah karena perlu keadaan belum masuk. */
export const ADMIN_PAGES: AdminPage[] = [
  { path: "/admin" },
  { path: "/admin/booking" },
  { path: "/admin/booking/baru" },
  { path: "/admin/pengingat" },
  { path: "/admin/pasien" },
  { path: "/admin/pasien/[id]", from: "/admin/pasien", link: 'a[href^="/admin/pasien/"]' },
  { path: "/admin/kunjungan/[id]", from: "/admin/pasien", via: 'a[href^="/admin/pasien/"]', link: 'a[href^="/admin/kunjungan/"]' },
  { path: "/admin/isian/[id]", from: "/admin/pasien", via: 'a[href^="/admin/pasien/"]', link: 'a[href^="/admin/isian/"]' },
  { path: "/admin/jadwal" },
  { path: "/admin/tagihan" },
  { path: "/admin/tagihan/[id]", from: "/admin/tagihan?lihat=BELUM_LUNAS", link: 'a[href^="/admin/tagihan/"]' },
  { path: "/admin/resep" },
  { path: "/admin/resep/[id]", from: "/admin/resep", link: 'a[href^="/admin/resep/"]' },
  { path: "/admin/resep/[id]/etiket", from: "/admin/resep", via: 'a[href^="/admin/resep/"]', link: 'a[href$="/etiket"]' },
  { path: "/admin/stok" },
  { path: "/admin/stok/barang/[id]", from: "/admin/stok", link: 'a[href^="/admin/stok/barang/"]' },
  { path: "/admin/stok/masuk/[id]", from: "/admin/stok?tab=masuk", link: 'a[href^="/admin/stok/masuk/"]' },
  { path: "/admin/stok/masuk/baru" },
  { path: "/admin/stok-dokter" },
  { path: "/admin/hutang" },
  { path: "/admin/pengeluaran" },
  { path: "/admin/laporan" },
  { path: "/admin/layanan" },
  { path: "/admin/staf" },
  { path: "/admin/pengaturan" },
  { path: "/admin/stok?tab=supplier" },
];

async function firstHref(page: Page, from: string, selector: string): Promise<string | null> {
  await page.goto(from);
  await page.waitForLoadState("networkidle");
  return page.locator(selector).first().getAttribute("href", { timeout: 3_000 }).catch(() => null);
}

/** Alamat sebenarnya untuk sebuah halaman; `null` bila data contohnya belum ada (mis. belum ada resep). */
export async function resolveAdminPage(page: Page, target: AdminPage): Promise<string | null> {
  if (!target.from) return target.path;
  if (!target.via) return firstHref(page, target.from, target.link!);
  await page.goto(target.from);
  await page.waitForLoadState("networkidle");
  const hops = await page.locator(target.via).evaluateAll((links) => links.slice(0, 10).map((a) => a.getAttribute("href")));
  for (const hop of hops) {
    const href = hop && (await firstHref(page, hop, target.link!));
    if (href) return href;
  }
  return null;
}
