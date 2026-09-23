import { formatPrice, formatRupiah } from "@/lib/format";

type PriceTagProps = {
  normalPrice?: number | null;
  promoPrice: number;
  priceNote?: string | null;
};

export function PriceTag({ normalPrice, promoPrice, priceNote }: PriceTagProps) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2">
      {normalPrice ? (
        <>
          <span className="sr-only">Harga normal:</span>
          <s className="text-sm text-brown-600">{formatRupiah(normalPrice)}</s>
        </>
      ) : null}
      <span className="text-lg font-semibold text-gold-600">
        {formatPrice(promoPrice, priceNote)}
      </span>
    </p>
  );
}
