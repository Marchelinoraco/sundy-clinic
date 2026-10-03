import type { Metadata } from "next";
import { ServiceCard } from "@/components/catalog/service-card";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { CategoryNav } from "@/components/public/category-nav";
import { PageHero } from "@/components/public/page-hero";
import { categoryAnchorId } from "@/lib/category-anchor";
import { FALLBACK_IMAGE } from "@/lib/site-images";
import { getServiceCategoriesWithServices } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Layanan & Harga",
  description:
    "Daftar lengkap treatment SunDY Clinic Manado: facial, peeling, RF, HIFU, botox, laser, dermapen, skin booster, dan vitamin C beserta harganya.",
};

export default async function ServicesPage() {
  const categories = await getServiceCategoriesWithServices();
  const treatmentCount = categories.reduce((total, category) => total + category.services.length, 0);

  return (
    <>
      <PageHero
        title="Layanan & Harga"
        image={FALLBACK_IMAGE}
        description={
          <>
            <p className="font-medium text-brown-800">{treatmentCount} treatment · harga promo berlaku</p>
            <p className="mt-2">
              Seluruh treatment yang tersedia di SunDY Clinic Manado. Harga yang tercantum adalah harga
              promo yang sedang berjalan.
            </p>
          </>
        }
      />

      <CategoryNav categories={categories.map(({ slug, name }) => ({ slug, name }))} />

      <div className="mx-auto max-w-6xl px-4 pb-16">
        {categories.map((category) => (
          <section
            key={category.id}
            id={categoryAnchorId(category.slug)}
            data-category={category.slug}
            aria-labelledby={`kategori-${category.slug}`}
            className="scroll-mt-[calc(var(--header-h)+4.5rem)] pt-14"
          >
            <h2 id={`kategori-${category.slug}`} className="font-display text-3xl text-brown-900">
              {category.name}
            </h2>
            {category.description && <p className="mt-1 text-sm text-brown-600">{category.description}</p>}

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {category.services.map((service, index) => (
                <Reveal key={service.id} delay={staggerDelay(index)} className="h-full">
                  <ServiceCard service={service} categorySlug={category.slug} />
                </Reveal>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
