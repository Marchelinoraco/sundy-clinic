import { RegisterCta } from "@/components/layout/register-cta";
import { Magnetic } from "@/components/motion/magnetic";
import { Parallax } from "@/components/motion/parallax";
import { CLINIC_TAGLINE } from "@/lib/clinic";
import { buildWhatsAppLink, generalInquiryMessage } from "@/lib/whatsapp";
import { MorphBlob } from "./morph-blob";

export function FinalCta() {
  return (
    <section
      aria-labelledby="ajakan-akhir"
      className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_50%_0%,var(--color-cream-100),var(--color-cream-200)_50%,var(--color-gold-300))] px-4 py-24 text-center"
    >
      <Parallax distance={-40} className="pointer-events-none absolute -left-24 -top-24 h-96 w-96">
        <MorphBlob className="inset-0" />
      </Parallax>
      <Parallax distance={40} className="pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem]">
        <MorphBlob className="inset-0" tone="cream" />
      </Parallax>

      <div className="relative mx-auto max-w-2xl">
        <h2 id="ajakan-akhir" className="font-display text-4xl text-brown-900 sm:text-5xl">
          Mulai perjalanan sehat Anda
        </h2>
        <p className="mt-4 text-lg text-brown-700">
          {CLINIC_TAGLINE}. Konsultasikan tujuan Anda bersama dokter kami.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Magnetic>
            <RegisterCta />
          </Magnetic>
          <Magnetic>
            <a
              href={buildWhatsAppLink(generalInquiryMessage())}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-full border border-brown-800/30 bg-white/70 px-7 py-3 font-medium text-brown-800 hover:bg-white"
            >
              Chat WhatsApp
            </a>
          </Magnetic>
        </div>
      </div>
    </section>
  );
}
