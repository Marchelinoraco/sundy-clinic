/** Urutan kelompok paket sebagaimana ditampilkan ke pengunjung. */
export const PACKAGE_GROUPS = ["MAX", "LUX", "ACTIVE"] as const;

export type PackageGroupName = (typeof PACKAGE_GROUPS)[number];

/** Nilai ?paket= di alamat halaman → kelompok paket. Kosong atau tidak dikenal kembali ke MAX. */
export function parsePackageGroup(value: string | string[] | undefined): PackageGroupName {
  const raw = Array.isArray(value) ? value[0] : value;
  const wanted = raw?.trim().toUpperCase();
  return PACKAGE_GROUPS.find((group) => group === wanted) ?? "MAX";
}
