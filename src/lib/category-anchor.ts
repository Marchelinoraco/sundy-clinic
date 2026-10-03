/** Id bagian kategori di /layanan, dipakai chip kategori dan tautan #bagian-…. */
export function categoryAnchorId(slug: string): string {
  return `bagian-${slug}`;
}
