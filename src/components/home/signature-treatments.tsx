import Link from "next/link";
import type { ComponentProps } from "react";
import { ServiceCard } from "@/components/catalog/service-card";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";

type SignatureService = ComponentProps<typeof ServiceCard>["service"] & {
  id: string;
  category: { slug: string };
};

/** Layanan signature: digeser menyamping dengan jepretan per kartu di ponsel, kisi di layar lebar. */
export function SignatureTreatments({ services }: { services: SignatureService[] }) {
  return (
    <section aria-labelledby="signature" className="mx-auto max-w-6xl px-4 py-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 id="signature" className="font-display text-4xl text-brown-900">
          Our Signature Treatment
        </h2>
        <Link href="/layanan" className="text-sm font-medium text-gold-600 underline-offset-4 hover:underline">
          Lihat seluruh layanan
        </Link>
      </div>

      <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {services.map((service, index) => (
          <li key={service.id} className="w-[78%] shrink-0 snap-start sm:w-auto">
            <Reveal delay={staggerDelay(index)} className="h-full">
              <ServiceCard service={service} categorySlug={service.category.slug} />
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}
