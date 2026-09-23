import type { Metadata } from "next";
import { ServiceCard } from "@/components/catalog/service-card";
import { getServiceCategoriesWithServices } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Layanan & Harga",
  description:
    "Daftar lengkap treatment SunDY Clinic Manado: facial, peeling, RF, HIFU, botox, laser, dermapen, skin booster, dan vitamin C beserta harganya.",
};

export default async function ServicesPage() {
  const categories = await getServiceCategoriesWithServices();

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Layanan & Harga</h1>
      <p className="mt-3 max-w-2xl text-brown-600">
        Seluruh treatment yang tersedia di SunDY Clinic Manado. Harga yang tercantum adalah harga
        promo yang sedang berjalan.
      </p>

      {categories.map((category) => (
        <section key={category.id} className="mt-14" aria-labelledby={`kategori-${category.slug}`}>
          <h2 id={`kategori-${category.slug}`} className="font-display text-2xl text-brown-900">
            {category.name}
          </h2>
          {category.description && (
            <p className="mt-1 text-sm text-brown-600">{category.description}</p>
          )}

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {category.services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
