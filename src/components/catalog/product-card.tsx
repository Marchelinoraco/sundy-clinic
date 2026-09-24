import { formatRupiah } from "@/lib/format";
import { buildWhatsAppLink, productInquiryMessage } from "@/lib/whatsapp";

type ProductCardProps = {
  product: {
    slug: string;
    name: string;
    description?: string | null;
    price?: number | null;
  };
};

export function ProductCard({ product }: ProductCardProps) {
  return (
    <article className="flex flex-col rounded-2xl border border-cream-300 bg-white p-5 shadow-sm">
      <h3 className="font-display text-xl text-brown-900">{product.name}</h3>

      {product.description && (
        <p className="mt-2 text-sm text-brown-600">{product.description}</p>
      )}

      <p className="mt-3 text-base font-semibold text-gold-600">
        {product.price ? formatRupiah(product.price) : "Hubungi kami untuk harga"}
      </p>

      <a
        href={buildWhatsAppLink(productInquiryMessage(product.name))}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-auto pt-4"
      >
        <span className="inline-block rounded-full bg-gold-500 px-5 py-2 text-sm font-medium text-white hover:bg-gold-600">
          Pesan via WhatsApp
        </span>
      </a>
    </article>
  );
}
