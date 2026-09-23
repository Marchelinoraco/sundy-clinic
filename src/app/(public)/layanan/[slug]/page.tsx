import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceTag } from "@/components/catalog/price-tag";
import { formatPrice } from "@/lib/format";
import { buildWhatsAppLink, serviceInquiryMessage } from "@/lib/whatsapp";
import { getAllServiceSlugs, getServiceBySlug } from "@/server/catalog";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const slugs = await getAllServiceSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) {
    return { title: "Layanan tidak ditemukan" };
  }

  const price = formatPrice(service.promoPrice, service.priceNote);

  return {
    title: `${service.name} — ${price}`,
    description: service.description ?? `${service.name} di SunDY Clinic Manado. ${price}.`,
  };
}

export default async function ServiceDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const service = await getServiceBySlug(slug);

  if (!service) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <nav aria-label="Remah roti" className="text-sm text-brown-600">
        <Link href="/layanan" className="underline-offset-4 hover:underline">
          Layanan
        </Link>
        <span aria-hidden="true"> · </span>
        <span>{service.category.name}</span>
      </nav>

      <h1 className="mt-4 font-display text-4xl text-brown-900">{service.name}</h1>

      <div className="mt-4">
        <PriceTag
          normalPrice={service.normalPrice}
          promoPrice={service.promoPrice}
          priceNote={service.priceNote}
        />
      </div>

      {service.description && (
        <p className="mt-6 leading-relaxed text-brown-700">{service.description}</p>
      )}

      <dl className="mt-8 grid gap-4 rounded-2xl border border-cream-300 bg-cream-100 p-6 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-brown-600">Perkiraan durasi</dt>
          <dd className="mt-1 text-brown-900">{service.durationMin} menit</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-brown-600">Kategori</dt>
          <dd className="mt-1 text-brown-900">{service.category.name}</dd>
        </div>
      </dl>

      {/* Pendaftaran konsultasi daring dibangun pada Plan 3. Sampai saat itu,
          WhatsApp adalah satu-satunya jalur pendaftaran. */}
      <a
        href={buildWhatsAppLink(serviceInquiryMessage(service.name))}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 inline-block rounded-full bg-gold-500 px-7 py-3 font-medium text-white hover:bg-gold-600"
      >
        Tanya & Daftar via WhatsApp
      </a>
    </div>
  );
}
