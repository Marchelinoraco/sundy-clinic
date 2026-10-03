import Link from "next/link";
import { RegisterCta } from "@/components/layout/register-cta";
import { Magnetic } from "@/components/motion/magnetic";
import { Parallax } from "@/components/motion/parallax";
import { ArchImage } from "@/components/public/arch-image";
import { FloatingChip } from "@/components/public/floating-chip";
import { MorphBlob } from "@/components/public/morph-blob";
import { CLINIC_BEAUTY_TAGLINE, CLINIC_TAGLINE, CUSTOMER_COUNT } from "@/lib/clinic";
import { CLINIC_GALLERY, type SiteImage } from "@/lib/site-images";

/** CLINIC_FULL_NAME tanpa tanda pisah, dipecah per baris untuk animasi judul. */
export const HERO_TITLE_LINES = ["SunDY", "Nutrition, Slimming", "& Wellness Clinic"];

type HomeHeroProps = {
  /** Dokter utama yang tampil di situs; null bila belum ada. */
  doctor: { name: string; specialty: string | null } | null;
  /** Foto 1 dr. Diane; null bila belum ada, lalu foto suasana yang dipakai. */
  photo: SiteImage | null;
};

export function HomeHero({ doctor, photo }: HomeHeroProps) {
  return (
    <section
      aria-labelledby="judul-beranda"
      className="hero-bleed relative overflow-hidden bg-[radial-gradient(120%_100%_at_0%_0%,var(--color-cream-50),var(--color-cream-100)_45%,var(--color-cream-200)_75%,var(--color-gold-300))] pb-20 sm:pb-24"
    >
      <Parallax distance={-40} className="pointer-events-none absolute -right-32 -top-24 h-[30rem] w-[30rem] sm:h-[40rem] sm:w-[40rem]">
        <MorphBlob className="inset-0" />
      </Parallax>
      <MorphBlob className="-bottom-40 -left-32 h-80 w-80" tone="cream" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <h1
            id="judul-beranda"
            className="font-display text-[2.6rem] leading-[1.05] text-brown-900 sm:text-6xl lg:text-7xl"
          >
            {HERO_TITLE_LINES.map((line, index) => (
              <span key={line}>
                {index > 0 && " "}
                <span
                  className={`hero-line block ${index === 0 ? "text-gold-600" : ""}`}
                  style={{ animationDelay: `${index * 120}ms` }}
                >
                  {line}
                </span>
              </span>
            ))}
          </h1>

          <p className="hero-line mt-5 text-lg text-brown-700" style={{ animationDelay: "360ms" }}>
            {CLINIC_TAGLINE} · {CLINIC_BEAUTY_TAGLINE}
          </p>

          <div className="hero-line mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "480ms" }}>
            <Magnetic>
              <RegisterCta />
            </Magnetic>
            <Link
              href="/program-slimming"
              className="rounded-full border border-gold-500 bg-white/60 px-7 py-3 font-medium text-gold-600 hover:bg-white"
            >
              Program Slimming
            </Link>
          </div>

          <Link
            href="/layanan"
            className="hero-line mt-5 inline-block text-sm font-medium text-brown-700 underline decoration-gold-400 underline-offset-4 hover:text-brown-900"
            style={{ animationDelay: "560ms" }}
          >
            Lihat Layanan & Harga
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-[20rem] sm:max-w-[22rem] lg:max-w-[26rem]">
          <Parallax distance={24}>
            <ArchImage
              image={photo ?? CLINIC_GALLERY[0]}
              priority
              rise
              sizes="(min-width: 1024px) 416px, (min-width: 640px) 352px, 80vw"
              className="aspect-[4/5] w-full"
            />
          </Parallax>

          {doctor && (
            <FloatingChip className="-left-3 bottom-14 max-w-[14rem] sm:-left-10">
              <p className="font-display text-base font-semibold leading-tight text-brown-900">{doctor.name}</p>
              {doctor.specialty && <p className="mt-0.5 text-xs text-brown-600">{doctor.specialty}</p>}
            </FloatingChip>
          )}

          <FloatingChip className="-right-2 top-10 text-center sm:-right-8" delayMs={1200}>
            <p className="font-display text-2xl font-semibold text-gold-600">{CUSTOMER_COUNT}+</p>
            <p className="text-xs text-brown-600">customer</p>
          </FloatingChip>
        </div>
      </div>
    </section>
  );
}
