import type { Metadata } from "next";
import { PackageCard } from "@/components/catalog/package-card";
import { ServiceCard } from "@/components/catalog/service-card";
import { CLINIC_TAGLINE } from "@/lib/clinic";
import { getPackagesByGroup, getServiceCategoriesWithServices } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Program Slimming",
  description:
    "Paket program slimming bulanan SunDY Clinic Manado: MAX, LUX, dan ACTIVE. Termasuk konsultasi dokter, Timbang BIA, dan pendampingan nutrisi.",
};

const GROUP_DESCRIPTION: Record<string, string> = {
  MAX: "Shape with Care, Transform with Confidence",
  LUX: "A More Refined Way to Reach Your Ideal Shape",
  ACTIVE: "Personalized Care for Your Best Self",
};

/** Layanan satuan program slimming, ditampilkan terpisah dari paket bulanan. */
const INDIVIDUAL_SERVICE_SLUGS = ["konsultasi-dokter", "timbang-bia", "meal-plan"];

export default async function SlimmingProgramPage() {
  const [groups, categories] = await Promise.all([
    getPackagesByGroup(),
    getServiceCategoriesWithServices(),
  ]);

  const allServices = categories.flatMap((category) => category.services);
  const individualServices = INDIVIDUAL_SERVICE_SLUGS.map((slug) =>
    allServices.find((service) => service.slug === slug),
  ).filter((service) => service !== undefined);

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Program Slimming</h1>
      <p className="mt-3 max-w-2xl text-brown-600">
        {CLINIC_TAGLINE}. Setiap paket sudah termasuk konsultasi dokter dan Timbang BIA untuk
        memantau komposisi tubuh Anda dari bulan ke bulan.
      </p>

      {groups.map((group) => (
        <section
          key={group.groupName}
          className="mt-14"
          aria-labelledby={`paket-${group.groupName}`}
        >
          <h2 id={`paket-${group.groupName}`} className="font-display text-3xl text-brown-900">
            Paket {group.groupName}
          </h2>
          <p className="mt-1 text-sm italic text-brown-600">{GROUP_DESCRIPTION[group.groupName]}</p>

          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {group.packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} />
            ))}
          </div>
        </section>
      ))}

      <section className="mt-16" aria-labelledby="layanan-satuan">
        <h2 id="layanan-satuan" className="font-display text-3xl text-brown-900">
          Layanan Satuan
        </h2>
        <p className="mt-1 text-sm text-brown-600">
          Ingin mencoba tanpa mengambil paket bulanan? Layanan berikut tersedia satuan.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {individualServices.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>

        <p className="mt-6 rounded-2xl border border-cream-300 bg-cream-100 p-5 text-sm text-brown-700">
          <strong className="font-semibold">Nutrigenomics Program</strong> — segera hadir.
        </p>
      </section>
    </div>
  );
}
