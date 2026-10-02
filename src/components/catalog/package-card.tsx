import { Check } from "lucide-react";
import { formatRupiah } from "@/lib/format";

type PackageCardProps = {
  pkg: {
    slug: string;
    name: string;
    monthlyPrice: number;
    items: { id: string; label: string }[];
  };
};

export function PackageCard({ pkg }: PackageCardProps) {
  return (
    <article className="flex h-full flex-col rounded-3xl border border-gold-300 bg-white p-6 shadow-sm">
      <h3 className="font-display text-2xl text-brown-900">{pkg.name}</h3>

      <p className="mt-1">
        <span className="text-xl font-semibold text-gold-600">{formatRupiah(pkg.monthlyPrice)}</span>
        <span className="text-sm text-brown-600"> / bulan</span>
      </p>

      <ul className="mt-5 space-y-2 text-sm text-brown-700">
        {pkg.items.map((item, index) => (
          // Isi paket muncul bergiliran setiap panel paket dibuka (animasi CSS mulai ulang saat panel tampil).
          <li key={item.id} className="check-in flex gap-2" style={{ animationDelay: `${150 + index * 60}ms` }}>
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-gold-600" />
            {item.label}
          </li>
        ))}
      </ul>
    </article>
  );
}
