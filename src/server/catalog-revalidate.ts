import { prisma } from "@/lib/db";
import { safeRevalidatePath } from "@/lib/revalidate";

const CATALOG_PAGES = ["/", "/layanan", "/program-slimming", "/daftar", "/admin/layanan", "/admin/booking/baru"] as const;

/** Halaman yang memuat katalog di-prerender; tanpa ini perubahan baru tampil saat deploy berikutnya (spec layanan situs 5.2). */
export function revalidateSitePages(slugs: readonly string[]): void {
  for (const path of CATALOG_PAGES) safeRevalidatePath(path);
  for (const slug of new Set(slugs)) safeRevalidatePath(`/layanan/${slug}`);
}

/** Halaman situs yang menampilkan harga atau status layanan internal ini lewat layanan situsnya. */
export async function revalidateServicePages(serviceId: string): Promise<void> {
  const linked = await prisma.siteService.findMany({ where: { serviceId }, select: { slug: true } });
  revalidateSitePages(linked.map((row) => row.slug));
}
