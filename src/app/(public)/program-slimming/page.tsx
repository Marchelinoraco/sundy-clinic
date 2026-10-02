import type { Metadata } from "next";
import { ServiceCard } from "@/components/catalog/service-card";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { FinalCta } from "@/components/public/final-cta";
import { PackageTabs, type PackageTabGroup } from "@/components/public/package-tabs";
import { PageHero } from "@/components/public/page-hero";
import { ProgramSteps } from "@/components/public/program-steps";
import { CLINIC_TAGLINE } from "@/lib/clinic";
import { parsePackageGroup } from "@/lib/package-group";
import { STEP_IMAGES } from "@/lib/site-images";
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

type PageProps = { searchParams: Promise<{ paket?: string | string[] }> };

export default async function SlimmingProgramPage({ searchParams }: PageProps) {
  // ?paket= dibaca di server supaya kelompok yang dibagikan langsung terbuka tanpa berkedip.
  const [{ paket }, groups, categories] = await Promise.all([
    searchParams,
    getPackagesByGroup(),
    getServiceCategoriesWithServices(),
  ]);

  // Hanya data polos ke komponen klien.
  const tabGroups: PackageTabGroup[] = groups.map((group) => ({
    groupName: group.groupName,
    tagline: GROUP_DESCRIPTION[group.groupName] ?? "",
    packages: group.packages.map((pkg) => ({
      id: pkg.id,
      slug: pkg.slug,
      name: pkg.name,
      monthlyPrice: pkg.monthlyPrice,
      items: pkg.items.map((item) => ({ id: item.id, label: item.label })),
    })),
  }));

  const individualServices = INDIVIDUAL_SERVICE_SLUGS.flatMap((slug) => {
    for (const category of categories) {
      const service = category.services.find((candidate) => candidate.slug === slug);
      if (service) return [{ service, categorySlug: category.slug }];
    }
    return [];
  });

  return (
    <>
      <PageHero
        title="Program Slimming"
        image={STEP_IMAGES.kontrol}
        description={
          <p>
            {CLINIC_TAGLINE}. Setiap paket sudah termasuk konsultasi dokter dan Timbang BIA untuk
            memantau komposisi tubuh Anda dari bulan ke bulan.
          </p>
        }
      />

      <section aria-label="Paket bulanan" className="mx-auto max-w-6xl px-4 py-14">
        <PackageTabs groups={tabGroups} initialGroup={parsePackageGroup(paket)} />
      </section>

      <ProgramSteps headingId="cara-kerja" title="Cara kerja program" />

      <section aria-labelledby="layanan-satuan" className="mx-auto max-w-6xl px-4 pb-20">
        <h2 id="layanan-satuan" className="font-display text-3xl text-brown-900">
          Layanan Satuan
        </h2>
        <p className="mt-1 text-sm text-brown-600">
          Ingin mencoba tanpa mengambil paket bulanan? Layanan berikut tersedia satuan.
        </p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {individualServices.map(({ service, categorySlug }, index) => (
            <Reveal key={service.id} delay={staggerDelay(index)} className="h-full">
              <ServiceCard service={service} categorySlug={categorySlug} />
            </Reveal>
          ))}
        </div>

        <p className="mt-6 rounded-3xl border border-cream-300 bg-cream-100 p-5 text-sm text-brown-700">
          <strong className="font-semibold">Nutrigenomics Program</strong> — segera hadir.
        </p>
      </section>

      <FinalCta />
    </>
  );
}
