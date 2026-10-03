import Image from "next/image";
import Link from "next/link";
import { Tilt } from "@/components/motion/tilt";
import { serviceImage } from "@/lib/site-images";
import { PriceTag } from "./price-tag";

type ServiceCardProps = {
  service: {
    slug: string;
    name: string;
    description?: string | null;
    normalPrice?: number | null;
    promoPrice: number;
    priceNote?: string | null;
    imageUrl?: string | null;
  };
  /** Kategori layanan; fotonya dipakai bila layanan belum punya foto sendiri. */
  categorySlug?: string | null;
};

export function ServiceCard({ service, categorySlug }: ServiceCardProps) {
  const image = serviceImage(service, categorySlug);

  return (
    <Tilt>
      <article className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-sm hover:shadow-lg">
        <div className="relative aspect-[4/3] overflow-hidden bg-cream-200">
          {/* Foto ilustrasi; nama layanan sudah ada di judul kartu. */}
          <Image
            src={image.src}
            alt=""
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 80vw"
            className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
          />
        </div>

        <div className="flex flex-1 flex-col p-5">
          <h3 className="font-display text-xl text-brown-900">
            {/* Seluruh kartu bisa diklik lewat ::after, tetapi nama tautannya tetap nama layanan. */}
            <Link
              href={`/layanan/${service.slug}`}
              className="underline-offset-4 after:absolute after:inset-0 after:rounded-3xl hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-gold-500"
            >
              {service.name}
            </Link>
          </h3>

          {service.description && (
            <p className="mt-2 line-clamp-3 text-sm text-brown-600">{service.description}</p>
          )}

          <div className="mt-auto pt-4">
            <PriceTag
              normalPrice={service.normalPrice}
              promoPrice={service.promoPrice}
              priceNote={service.priceNote}
            />
          </div>
        </div>
      </article>
    </Tilt>
  );
}
