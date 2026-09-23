import Link from "next/link";
import { PriceTag } from "./price-tag";

type ServiceCardProps = {
  service: {
    slug: string;
    name: string;
    description?: string | null;
    normalPrice?: number | null;
    promoPrice: number;
    priceNote?: string | null;
  };
};

export function ServiceCard({ service }: ServiceCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-cream-300 bg-white p-5 shadow-sm transition hover:shadow-md">
      <h3 className="font-display text-xl text-brown-900">
        <Link href={`/layanan/${service.slug}`} className="underline-offset-4 hover:underline">
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
    </article>
  );
}
