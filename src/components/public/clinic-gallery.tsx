import Image from "next/image";
import { Parallax } from "@/components/motion/parallax";
import { CLINIC_GALLERY } from "@/lib/site-images";
import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";

/** Tiap foto bergeser dengan kecepatan berbeda (parallax). Foto pertama melebar di ponsel. */
const LAYOUT = [
  { distance: -30, wrapper: "col-span-2 md:col-span-1", frame: "aspect-[3/2] md:aspect-[4/5]", sizes: "(min-width: 768px) 360px, 92vw" },
  { distance: 45, wrapper: "md:mt-16", frame: "aspect-[4/5]", sizes: "(min-width: 768px) 360px, 46vw" },
  { distance: -55, wrapper: "", frame: "aspect-[4/5]", sizes: "(min-width: 768px) 360px, 46vw" },
];

export function ClinicGallery({ headingId }: { headingId: string }) {
  return (
    <section aria-labelledby={headingId} className="overflow-hidden bg-cream-100 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <Eyebrow>Suasana</Eyebrow>
        <h2 id={headingId} className="mt-2 font-display text-4xl text-brown-900">
          Tenang, bersih, dan nyaman
        </h2>

        {/* Jarak baris di ponsel lebih lebar dari geseran parallax supaya foto tidak saling menimpa. */}
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-12 md:grid-cols-3 md:items-start md:gap-4">
          {CLINIC_GALLERY.map((image, index) => {
            const layout = LAYOUT[index % LAYOUT.length];
            return (
              <Parallax key={image.src} distance={layout.distance} className={layout.wrapper}>
                <div className={cn("relative overflow-hidden rounded-[2rem] bg-cream-200", layout.frame)}>
                  <Image src={image.src} alt={image.alt} fill sizes={layout.sizes} className="object-cover" />
                </div>
              </Parallax>
            );
          })}
        </div>
      </div>
    </section>
  );
}
