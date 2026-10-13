import { prisma } from "@/lib/db";
import { ONLINE_SERVICE_SLUG } from "@/lib/online-consultation";

/** Satu pilihan katalog internal (spec layanan situs 4.2 dan 6): untuk formulir janji temu admin dan "+ Baris layanan". */
export type InternalServiceOption = {
  id: string;
  slug: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  durationMin: number;
  requiresDoctor: boolean;
};

/**
 * Layanan internal aktif, termasuk item khusus internal, tanpa Konsultasi Online. Modul biasa tanpa pemeriksaan hak: pemanggilnya
 * halaman yang sudah memeriksa hak sendiri. Biaya dan komisi sengaja tidak dimuat (spec harga modal 8).
 */
export async function listInternalServiceOptions(): Promise<InternalServiceOption[]> {
  const rows = await prisma.service.findMany({
    where: { isActive: true, slug: { not: ONLINE_SERVICE_SLUG } },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      categoryId: true,
      promoPrice: true,
      durationMin: true,
      requiresDoctor: true,
      category: { select: { name: true } },
    },
  });
  return rows.map(({ category, promoPrice, ...row }) => ({ ...row, categoryName: category.name, price: promoPrice }));
}
