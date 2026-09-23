import type { Metadata } from "next";
import Link from "next/link";
import { BranchCard } from "@/components/catalog/branch-card";
import { getBranches } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Lokasi Klinik",
  description:
    "Lokasi SunDY Clinic Manado: cabang Mahakeret Barat (Jl. Garuda No. 10) dan cabang Citraland Cluster The Manhattan yang segera hadir.",
};

export default async function LocationsPage() {
  const branches = await getBranches();

  return (
    <div className="mx-auto max-w-4xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Lokasi Klinik</h1>
      <p className="mt-3 text-brown-600">SunDY Clinic hadir di dua lokasi di Manado.</p>

      <div className="mt-10 grid gap-6">
        {branches.map((branch) => (
          <div key={branch.id}>
            <BranchCard branch={branch} />
            <Link
              href={`/lokasi/${branch.slug}`}
              className="mt-2 inline-block text-sm text-gold-600 underline-offset-4 hover:underline"
            >
              Lihat detail {branch.name}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
