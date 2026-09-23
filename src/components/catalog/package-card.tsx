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
    <article className="rounded-2xl border border-gold-300 bg-cream-100 p-6 shadow-sm">
      <h3 className="font-display text-2xl text-brown-900">{pkg.name}</h3>

      <p className="mt-1">
        <span className="text-xl font-semibold text-gold-600">
          {formatRupiah(pkg.monthlyPrice)}
        </span>
        <span className="text-sm text-brown-600"> / bulan</span>
      </p>

      <ul className="mt-4 space-y-1 text-sm text-brown-700">
        {pkg.items.map((item) => (
          <li key={item.id} className="flex gap-2">
            <span aria-hidden="true" className="text-gold-500">
              •
            </span>
            {item.label}
          </li>
        ))}
      </ul>
    </article>
  );
}
