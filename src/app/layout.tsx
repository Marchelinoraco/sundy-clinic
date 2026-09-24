import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { CLINIC_BEAUTY_TAGLINE, CLINIC_FULL_NAME, CLINIC_NAME } from "@/lib/clinic";
import "./globals.css";

// Nama variabel sengaja berbeda dari token Tailwind (--font-display / --font-sans)
// agar token di globals.css dapat merujuknya tanpa saling menimpa.
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cormorant",
});

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: {
    default: `${CLINIC_FULL_NAME} — Manado`,
    template: `%s | ${CLINIC_NAME}`,
  },
  description: `${CLINIC_BEAUTY_TAGLINE}. Klinik nutrisi, slimming, dan perawatan estetika di Manado.`,
};

// Root layout hanya memegang <html>, font, dan metadata dasar. Header dan
// footer publik pindah ke (public)/layout.tsx agar panel admin tidak
// mewarisinya.
//
// Font tetap Cormorant + Plus Jakarta Sans, bukan Geist bawaan shadcn init:
// identitas SunDY sudah ditetapkan di Plan 1, dan panel admin memakai palet
// warna yang sama (lihat globals.css) agar terasa satu sistem dengan situs
// publik, bukan tampilan admin generik yang ditempel di atasnya.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${display.variable} ${sans.variable}`}>{children}</body>
    </html>
  );
}
