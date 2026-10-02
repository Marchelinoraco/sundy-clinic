import type { ReactNode } from "react";
import { Parallax } from "@/components/motion/parallax";
import type { SiteImage } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { ArchImage } from "./arch-image";
import { MorphBlob } from "./morph-blob";

type PageHeroProps = {
  title: string;
  /** Baris kecil di atas judul, misalnya jejak halaman. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  image?: SiteImage | null;
  /** "large" untuk detail layanan; bawaannya foto kecil di samping judul. */
  imageSize?: "small" | "large";
  /** Tombol atau chip di bawah deskripsi. */
  children?: ReactNode;
};

const IMAGE_CLASS = {
  small: "w-24 sm:w-48 lg:w-56",
  large: "w-28 sm:w-64 lg:w-80",
};

const IMAGE_SIZES = {
  small: "(min-width: 1024px) 224px, (min-width: 640px) 192px, 96px",
  large: "(min-width: 1024px) 320px, (min-width: 640px) 256px, 112px",
};

/**
 * Kepala halaman bersama: latar krem–emas yang menerus ke balik header
 * transparan, bentuk emas cair, judul yang naik per baris, dan foto lengkung.
 */
export function PageHero({ title, eyebrow, description, image, imageSize = "small", children }: PageHeroProps) {
  return (
    <section className="hero-bleed relative overflow-hidden bg-[radial-gradient(110%_120%_at_0%_0%,var(--color-cream-100),var(--color-cream-200)_55%,var(--color-gold-300))] pb-14">
      {/* Bentuk emas sedikit ikut bergeser saat digulir (spec §3.2). */}
      <Parallax
        distance={-30}
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 sm:h-[28rem] sm:w-[28rem]"
      >
        <MorphBlob className="inset-0" />
      </Parallax>
      <div className="relative mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-start gap-x-6 gap-y-6 px-4 sm:items-center">
        <div className="min-w-0">
          {eyebrow && <div className="hero-line text-sm text-brown-600">{eyebrow}</div>}
          <h1
            className="hero-line mt-2 font-display text-4xl leading-tight text-brown-900 sm:text-5xl"
            style={{ animationDelay: "80ms" }}
          >
            {title}
          </h1>
          {description && (
            <div className="hero-line mt-4 max-w-2xl text-brown-700" style={{ animationDelay: "160ms" }}>
              {description}
            </div>
          )}
        </div>
        {image && (
          <ArchImage
            image={image}
            priority
            rise
            sizes={IMAGE_SIZES[imageSize]}
            className={cn("aspect-[4/5] justify-self-end sm:row-span-2", IMAGE_CLASS[imageSize])}
          />
        )}
        {children && (
          <div className="hero-line col-span-2 sm:col-span-1" style={{ animationDelay: "240ms" }}>
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
