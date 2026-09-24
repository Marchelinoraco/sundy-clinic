import { CLOSED_NOTE } from "@/lib/clinic";
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
};

export function BranchCard({ branch }: BranchCardProps) {
  const isOpen = branch.status === "AKTIF";

  return (
    <article className="rounded-2xl border border-cream-300 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl text-brown-900">{branch.name}</h2>
        {!isOpen && (
          <span className="rounded-full bg-gold-300 px-3 py-1 text-xs font-semibold text-brown-900">
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
    </article>
  );
}
