/**
 * Tab halaman disimpan di alamat (`?tab=`), agar tetap sama setelah dimuat ulang
 * dan bisa dibagikan. Nilai yang tidak dikenal kembali ke cadangan (spec D 3.1).
 */
export function resolveTab<T extends string>(
  value: string | string[] | undefined,
  ids: readonly T[],
  fallback: T = ids[0],
): T {
  return typeof value === "string" && (ids as readonly string[]).includes(value) ? (value as T) : fallback;
}
