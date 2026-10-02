import "lenis/dist/lenis.css";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { WhatsAppFab } from "@/components/layout/whatsapp-fab";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Toaster } from "@/components/ui/sonner";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Gulir halus roda tetikus di desktop; mati di layar sentuh dan untuk "kurangi gerakan". */}
      <SmoothScroll />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
      <WhatsAppFab />
      {/* Pesan untuk customer di /daftar dan /cek-booking (galat kirim, jam penuh, kuis diperbarui). */}
      <Toaster />
    </>
  );
}
