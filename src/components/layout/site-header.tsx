import Link from "next/link";
import { Magnetic } from "@/components/motion/magnetic";
import { CLINIC_FULL_NAME } from "@/lib/clinic";
import { HeaderShell } from "./header-shell";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { MOBILE_NAV, PRIMARY_NAV } from "./nav-items";
import { NavLinks } from "./nav-links";
import { RegisterCta } from "./register-cta";

export function SiteHeader() {
  return (
    <HeaderShell>
      <Link
        href="/"
        aria-label={`${CLINIC_FULL_NAME} — beranda`}
        className="origin-left transition-transform duration-300 group-data-[solid=true]/header:scale-90 motion-reduce:transition-none"
      >
        <Logo className="h-11 md:h-12" />
      </Link>

      <NavLinks links={PRIMARY_NAV} />

      <div className="flex items-center gap-2">
        <div className="hidden md:block">
          <Magnetic>
            <RegisterCta className="px-5 py-2.5 text-sm" />
          </Magnetic>
        </div>
        {/* Di ponsel cukup "Daftar" supaya logo, tombol, dan menu muat di lebar 390 px. */}
        <Link
          href="/daftar"
          className="rounded-full bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 md:hidden"
        >
          Daftar
        </Link>
        <MobileMenu links={MOBILE_NAV} />
      </div>
    </HeaderShell>
  );
}
