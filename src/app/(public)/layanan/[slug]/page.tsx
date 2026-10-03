import { Clock, Tag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PriceTag } from "@/components/catalog/price-tag";
import { ServiceCard } from "@/components/catalog/service-card";
import { RegisterCta } from "@/components/layout/register-cta";
import { Magnetic } from "@/components/motion/magnetic";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { PageHero } from "@/components/public/page-hero";
import { StickyBookingBar } from "@/components/public/sticky-booking-bar";
import { formatPrice } from "@/lib/format";
import { serviceImage } from "@/lib/site-images";
import { buildWhatsAppLink, serviceInquiryMessage } from "@/lib/whatsapp";
import { getAllServiceSlugs, getRelatedServices, getServiceBySlug } from "@/server/catalog";

/** Id tombol utama; bar bawah di ponsel tampil setelah tombol ini tergulir lewat. */
const BOOKING_ACTIONS_ID = "aksi-booking";

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

  const related = await getRelatedServices(service.categoryId, service.id);
  const whatsappHref = buildWhatsAppLink(serviceInquiryMessage(service.name));

  return (
    <>
      <PageHero
        eyebrow={
          <nav aria-label="Remah roti">
            <Link href="/layanan" className="underline-offset-4 hover:underline">
              Layanan
            </Link>
            <span aria-hidden="true"> · </span>
            <span>{service.category.name}</span>
          </nav>
        }
        title={service.name}
        image={serviceImage(service, service.category.slug)}
        imageSize="large"
        description={
          <>
            <div className="pulse-once inline-block origin-left">
              <PriceTag
                normalPrice={service.normalPrice}
                promoPrice={service.promoPrice}
                priceNote={service.priceNote}
              />
            </div>
            {service.description && <p className="mt-4 leading-relaxed">{service.description}</p>}
          </>
        }
      >
        <dl className="flex flex-wrap gap-2 text-sm">
          <div className="rounded-full border border-cream-300 bg-white/80 px-3 py-1.5">
            <dt className="sr-only">Perkiraan durasi</dt>
            <dd className="flex items-center gap-1.5 text-brown-800">
              <Clock aria-hidden="true" className="size-4 text-gold-600" />
              {service.durationMin} menit
            </dd>
          </div>
          <div className="rounded-full border border-cream-300 bg-white/80 px-3 py-1.5">
            <dt className="sr-only">Kategori</dt>
            <dd className="flex items-center gap-1.5 text-brown-800">
              <Tag aria-hidden="true" className="size-4 text-gold-600" />
              {service.category.name}
            </dd>
          </div>
        </dl>

        <div id={BOOKING_ACTIONS_ID} className="mt-6 flex flex-wrap gap-3">
          <Magnetic>
            <RegisterCta />
          </Magnetic>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-full border border-gold-500 bg-white/60 px-7 py-3 font-medium text-gold-600 hover:bg-white"
          >
            Tanya via WhatsApp
          </a>
        </div>
      </PageHero>

      {related.length > 0 && (
        <section aria-labelledby="treatment-lain" className="mx-auto max-w-6xl px-4 py-16">
          <h2 id="treatment-lain" className="font-display text-3xl text-brown-900">
            Treatment lain di {service.category.name}
          </h2>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((other, index) => (
              <Reveal key={other.id} delay={staggerDelay(index)} className="h-full">
                <ServiceCard service={other} categorySlug={service.category.slug} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      <StickyBookingBar
        watchId={BOOKING_ACTIONS_ID}
        price={formatPrice(service.promoPrice, service.priceNote)}
        whatsappHref={whatsappHref}
      />
    </>
  );
}
