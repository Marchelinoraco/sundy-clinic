"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

/** Halaman tanpa kepala halaman berwarna: header sudah krem sejak atas supaya isi tidak menembus logo. */
const SOLID_PATHS = ["/daftar", "/cek-booking", "/isi", "/kebijakan-privasi", "/syarat-ketentuan"];

export const SCROLL_THRESHOLD = 40;

export function headerStartsSolid(pathname: string): boolean {
  return SOLID_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Header menempel di atas: transparan di atas hero, lalu krem buram setelah
 * digulir ±40 px. Latar krem muncul lewat opacity, dan logo mengecil lewat
 * transform (kelas group-data-[solid=true]/header di site-header.tsx). Tinggi
 * header tetap --header-h, jadi tidak ada animasi tinggi dan isi tidak melompat.
 */
export function HeaderShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const solid = scrolled || headerStartsSolid(pathname);

  return (
    <header
      data-solid={solid ? "true" : "false"}
      className="group/header fixed inset-x-0 top-0 z-40 h-[var(--header-h)]"
    >
      <span
        aria-hidden="true"
        className="absolute inset-0 border-b border-cream-300 bg-cream-50/90 opacity-0 shadow-sm backdrop-blur transition-opacity duration-300 group-data-[solid=true]/header:opacity-100 motion-reduce:transition-none"
      />
      <div className="relative mx-auto flex h-full max-w-6xl items-center justify-between gap-3 px-4">
        {children}
      </div>
    </header>
  );
}
