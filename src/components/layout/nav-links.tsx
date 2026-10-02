"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePath, type NavItem } from "./nav-items";

/** Menu desktop. Halaman aktif bergaris emas; garis yang sama muncul dari kiri saat disentuh kursor. */
export function NavLinks({ links }: { links: readonly NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Navigasi utama" className="hidden items-center gap-7 text-sm md:flex">
      {links.map((link) => {
        const active = isActivePath(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className="relative py-2 text-brown-700 after:absolute after:inset-x-0 after:bottom-0.5 after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-gold-500 after:transition-transform after:duration-300 hover:text-brown-900 hover:after:scale-x-100 aria-[current=page]:font-medium aria-[current=page]:text-brown-900 aria-[current=page]:after:scale-x-100 motion-reduce:after:transition-none"
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
