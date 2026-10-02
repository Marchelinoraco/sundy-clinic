import Image from "next/image";
import { CLOSED_NOTE } from "@/lib/clinic";
import { branchImage } from "@/lib/site-images";
import { branchNotifyMessage, buildWhatsAppLink } from "@/lib/whatsapp";

type BranchCardProps = {
  branch: {
    slug: string;
    name: string;
    address: string;
    openingHours: string;
    status: "AKTIF" | "SEGERA_HADIR";
    mapsUrl?: string | null;
  };
  /** 3 bila kartu berada di bawah judul bagian (Beranda). */
  headingLevel?: 2 | 3;
  /** Judul pengganti nama cabang, untuk halaman detail yang judul halamannya sudah nama cabang. */
  title?: string;
  /** false di halaman detail, yang fotonya sudah tampil di kepala halaman. */
  withImage?: boolean;
};

export function BranchCard({ branch, headingLevel = 2, title, withImage = true }: BranchCardProps) {
  const isOpen = branch.status === "AKTIF";
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const image = branchImage(branch.slug);

  return (
    <article
      className={`grid overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-sm ${withImage ? "sm:grid-cols-[13rem_1fr]" : ""}`}
    >
      {withImage && (
        <div className="relative aspect-[16/9] bg-cream-200 sm:aspect-auto sm:min-h-full">
          {/* Foto suasana sementara, bukan foto cabang itu sendiri; nama cabang ada di judul. */}
          <Image src={image.src} alt="" fill sizes="(min-width: 640px) 208px, 92vw" className="object-cover" />
        </div>
      )}

      <div className="p-6">
        <div className="flex flex-wrap items-center gap-3">
          <Heading className="font-display text-2xl text-brown-900">{title ?? branch.name}</Heading>
          {!isOpen && (
            <span className="pulse-soft inline-block rounded-full bg-gold-300 px-3 py-1 text-xs font-semibold text-brown-900">
              Segera Hadir
            </span>
          )}
        </div>

        <p className="mt-3 text-sm text-brown-700">{branch.address}</p>
        <p className="mt-3 text-sm text-brown-600">
          {branch.openingHours} · {CLOSED_NOTE}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          {isOpen && branch.mapsUrl && (
            <a
              href={branch.mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-gold-500 px-5 py-2 text-sm font-medium text-gold-600 hover:bg-cream-100"
            >
              Petunjuk Arah
            </a>
          )}

          {!isOpen && (
            <a
              href={buildWhatsAppLink(branchNotifyMessage(branch.name))}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              Beri tahu saya saat buka
            </a>
          )}
        </div>
      </div>
    </article>
  );
}
