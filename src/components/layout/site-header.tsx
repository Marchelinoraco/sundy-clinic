import Link from "next/link";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { Logo } from "./logo";

const navLinks = [
  { href: "/layanan", label: "Layanan" },
  { href: "/program-slimming", label: "Program Slimming" },
  { href: "/produk", label: "Produk" },
  { href: "/lokasi", label: "Lokasi" },
  { href: "/tentang", label: "Tentang" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-cream-300 bg-cream-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label={`${CLINIC_FULL_NAME} — beranda`}>
          <Logo className="h-11 md:h-14" />
        </Link>

        <nav aria-label="Navigasi utama" className="hidden gap-6 text-sm md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-brown-700 underline-offset-8 hover:text-brown-900 hover:underline"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* Navigasi mobile: baris yang dapat digulir horizontal, tanpa JavaScript. */}
      <nav
        aria-label="Navigasi utama mobile"
        className="flex gap-5 overflow-x-auto border-t border-cream-200 px-4 py-2 text-sm md:hidden"
      >
        {navLinks.map((link) => (
          <Link key={link.href} href={link.href} className="whitespace-nowrap text-brown-700">
            {link.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
