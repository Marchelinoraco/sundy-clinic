import type { Metadata } from "next";
import Link from "next/link";
import { BranchCard } from "@/components/catalog/branch-card";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { PageHero } from "@/components/public/page-hero";
import { CLINIC_GALLERY } from "@/lib/site-images";
import { getBranches } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Lokasi Klinik",
  description:
    "Lokasi SunDY Clinic Manado: cabang Mahakeret Barat (Jl. Garuda No. 10) dan cabang Citraland Cluster The Manhattan yang segera hadir.",
};

export default async function LocationsPage() {
  const branches = await getBranches();

  return (
    <>
      <PageHero
        title="Lokasi Klinik"
        image={CLINIC_GALLERY[0]}
        description={<p>SunDY Clinic hadir di dua lokasi di Manado.</p>}
      />

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14">
        {branches.map((branch, index) => (
          <Reveal key={branch.id} delay={staggerDelay(index)}>
            <BranchCard branch={branch} />
            <Link
              href={`/lokasi/${branch.slug}`}
              className="mt-3 inline-block text-sm font-medium text-gold-600 underline-offset-4 hover:underline"
            >
              Lihat detail {branch.name}
            </Link>
          </Reveal>
        ))}
      </div>
    </>
  );
}
