/** Mengubah nama menjadi slug URL. Tanda baca gelar ikut dibersihkan. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
