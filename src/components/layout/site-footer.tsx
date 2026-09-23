import Link from "next/link";
import {
  CLINIC_FULL_NAME,
  CLINIC_INSTAGRAM,
  CLINIC_WHATSAPP,
  CLINIC_WHATSAPP_DISPLAY,
  CLOSED_NOTE,
  OPENING_HOURS,
} from "@/lib/clinic";
import { Logo } from "./logo";

const navLinks = [
  { href: "/layanan", label: "Layanan" },
  { href: "/program-slimming", label: "Program Slimming" },
  { href: "/produk", label: "Produk" },
  { href: "/lokasi", label: "Lokasi" },
  { href: "/tentang", label: "Tentang" },
  { href: "/faq", label: "FAQ" },
  { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
  { href: "/syarat-ketentuan", label: "Syarat & Ketentuan" },
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-cream-300 bg-cream-100">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Logo className="h-20" withTagline />
        </div>

        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brown-700">Kontak</h2>
          <ul className="mt-4 space-y-2 text-sm">
            <li>
              <a
                className="text-brown-800 underline-offset-4 hover:underline"
                href={`https://wa.me/${CLINIC_WHATSAPP}`}
              >
                {CLINIC_WHATSAPP_DISPLAY}
              </a>
            </li>
            <li>
              <a
                className="text-brown-800 underline-offset-4 hover:underline"
                href={`https://instagram.com/${CLINIC_INSTAGRAM}`}
              >
                @{CLINIC_INSTAGRAM}
              </a>
            </li>
            <li className="pt-2 text-brown-600">{OPENING_HOURS}</li>
            <li className="text-brown-600">{CLOSED_NOTE}</li>
          </ul>
        </div>

        <nav aria-label="Tautan situs">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brown-700">Situs</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {navLinks.map((link) => (
              <li key={link.href}>
                <Link className="text-brown-800 underline-offset-4 hover:underline" href={link.href}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <p className="border-t border-cream-300 py-6 text-center text-xs text-brown-600">
        © {new Date().getFullYear()} {CLINIC_FULL_NAME}. Seluruh hak cipta dilindungi.
      </p>
    </footer>
  );
}
