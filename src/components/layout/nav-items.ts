export type NavItem = { href: string; label: string };

/** Menu utama di header desktop. */
export const PRIMARY_NAV: readonly NavItem[] = [
  { href: "/layanan", label: "Layanan" },
  { href: "/program-slimming", label: "Program Slimming" },
  { href: "/produk", label: "Produk" },
  { href: "/lokasi", label: "Lokasi" },
  { href: "/tentang", label: "Tentang" },
];

/** Menu panel ponsel: menu utama ditambah Beranda dan Tanya Jawab. */
export const MOBILE_NAV: readonly NavItem[] = [
  { href: "/", label: "Beranda" },
  ...PRIMARY_NAV,
  { href: "/faq", label: "Tanya Jawab" },
];

/** `true` bila `pathname` adalah halaman `href` atau turunannya (misalnya /layanan/hifu-wajah untuk /layanan). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
