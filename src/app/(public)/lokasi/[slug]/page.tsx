import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BranchCard } from "@/components/catalog/branch-card";
import { getBranchBySlug, getBranches } from "@/server/catalog";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const branches = await getBranches();
  return branches.map((branch) => ({ slug: branch.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);

  if (!branch) {
    return { title: "Lokasi tidak ditemukan" };
  }

  const status = branch.status === "AKTIF" ? "Buka" : "Segera hadir";

  return {
    title: branch.name,
    description: `${branch.name} — ${branch.address}. ${status}. ${branch.openingHours}.`,
  };
}

export default async function BranchDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const branch = await getBranchBySlug(slug);

  if (!branch) notFound();

  return (
    <div className="mx-auto max-w-3xl px-4 py-14">
      <BranchCard branch={branch} />
    </div>
  );
}
