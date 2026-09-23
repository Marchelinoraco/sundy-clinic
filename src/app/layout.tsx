import type { Metadata } from "next";
import { Cormorant_Garamond, Plus_Jakarta_Sans } from "next/font/google";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className={`${display.variable} ${sans.variable}`}>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
        <WhatsAppFab />
      </body>
    </html>
  );
}
