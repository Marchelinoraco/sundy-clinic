import Image from "next/image";
import { formatRupiah } from "@/lib/format";
import { productImage } from "@/lib/site-images";
import { buildWhatsAppLink, productInquiryMessage } from "@/lib/whatsapp";

type ProductCardProps = {
  product: {
    slug: string;
    name: string;
    description?: string | null;
    price?: number | null;
    imageUrl?: string | null;
  };
};

export function ProductCard({ product }: ProductCardProps) {
  const image = productImage(product);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-3xl border border-cream-300 bg-white shadow-sm">
      <div className="relative aspect-[4/3] overflow-hidden bg-cream-200">
        {/* Foto ilustrasi; nama produk sudah ada di judul kartu. */}
        <Image
          src={image.src}
          alt=""
          fill
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 45vw, 92vw"
          className="object-cover transition-transform duration-700 group-hover:scale-105 motion-reduce:transition-none"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-display text-xl text-brown-900">{product.name}</h3>

        {product.description && <p className="mt-2 text-sm text-brown-600">{product.description}</p>}

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
      </div>
    </article>
  );
}
