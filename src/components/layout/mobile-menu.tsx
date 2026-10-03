"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { CLINIC_NAME, CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { buildWhatsAppLink, generalInquiryMessage } from "@/lib/whatsapp";
import { isActivePath, type NavItem } from "./nav-items";
import { RegisterCta } from "./register-cta";

/**
 * Menu garis tiga di ponsel: panel meluncur dari kanan, berisi semua menu,
 * Daftar Konsultasi, dan WhatsApp. Tertutup saat tautan diklik, Esc ditekan,
 * tombol tutup diklik, atau halaman berganti (termasuk lewat tombol Kembali).
 */
export function MobileMenu({ links }: { links: readonly NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Buka menu"
        className="inline-flex size-10 items-center justify-center rounded-full border border-cream-300 bg-white/80 text-brown-800 md:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[82%] max-w-sm gap-0 border-cream-300 bg-cream-50 p-0"
      >
        <div className="flex items-center justify-between px-6 pt-6">
          <SheetTitle className="font-display text-2xl text-brown-900">Menu</SheetTitle>
          <SheetClose
            aria-label="Tutup menu"
            className="inline-flex size-10 items-center justify-center rounded-full border border-cream-300 text-brown-800"
          >
            <X className="size-5" aria-hidden="true" />
          </SheetClose>
        </div>
        <SheetDescription className="sr-only">Tautan halaman {CLINIC_NAME}</SheetDescription>

        <nav aria-label="Menu ponsel" className="mt-4 flex flex-col px-3">
          {links.map((link, index) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={close}
              aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
              className="panel-in rounded-xl px-3 py-3 font-display text-xl text-brown-800 hover:bg-cream-100 aria-[current=page]:text-gold-600"
              style={{ animationDelay: `${80 + index * 50}ms` }}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mt-auto grid gap-3 p-6">
          <RegisterCta className="text-center" />
          <a
            href={buildWhatsAppLink(generalInquiryMessage())}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className="rounded-full border border-gold-500 px-7 py-3 text-center font-medium text-gold-600 hover:bg-cream-100"
          >
            WhatsApp {CLINIC_WHATSAPP_DISPLAY}
          </a>
        </div>
      </SheetContent>
    </Sheet>
  );
}
