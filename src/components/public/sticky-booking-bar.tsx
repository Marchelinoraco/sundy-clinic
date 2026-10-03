"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type StickyBookingBarProps = {
  /** Id tombol utama di kepala halaman. */
  watchId: string;
  /** Harga berlaku yang sudah diformat. */
  price: string;
  whatsappHref: string;
};

/**
 * Bar bawah di ponsel (hilang mulai lg): harga, Daftar, dan WhatsApp.
 *
 * Bar tampil setelah tombol utama tergulir lewat ke atas, bukan sebelum
 * tombol itu tercapai. Ia dipasang di body supaya posisinya tidak terpengaruh
 * transisi halaman, dan `inert` selama tersembunyi supaya tautannya tidak
 * bisa difokus. Ruang bawah halaman dan geseran tombol WhatsApp diatur di
 * globals.css.
 */
export function StickyBookingBar({ watchId, price, whatsappHref }: StickyBookingBarProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setMounted(true);
    const target = document.getElementById(watchId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [watchId]);

  if (!mounted) return null;

  return createPortal(
    <div
      data-sticky-booking-bar=""
      data-visible={visible ? "true" : "false"}
      inert={!visible}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-cream-300 bg-cream-50/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_30px_-20px_rgb(46_37_23/0.5)] backdrop-blur transition duration-300 data-[visible=false]:translate-y-full data-[visible=false]:opacity-0 motion-reduce:transition-none lg:hidden"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <p className="min-w-0 flex-1 leading-tight">
          <span className="block text-xs text-brown-600">Harga</span>
          <span className="font-semibold text-gold-600">{price}</span>
        </p>
        <Link
          href="/daftar"
          className="rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600"
        >
          Daftar
        </Link>
        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-gold-500 px-4 py-2 text-sm font-medium text-gold-600"
        >
          WhatsApp
        </a>
      </div>
    </div>,
    document.body,
  );
}
