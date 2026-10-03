import type { Metadata } from "next";
import { ProductCard } from "@/components/catalog/product-card";
import { Reveal } from "@/components/motion/reveal";
import { staggerDelay } from "@/components/motion/stagger";
import { PageHero } from "@/components/public/page-hero";
import { CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { PRODUCT_IMAGE } from "@/lib/site-images";
import { getActiveProducts } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Produk",
  description:
    "Produk pendukung program SunDY Clinic Manado. Pemesanan dilakukan lewat WhatsApp setelah konsultasi dokter.",
};

export default async function ProductsPage() {
  const products = await getActiveProducts();

  return (
    <>
      <PageHero
        title="Produk"
        image={PRODUCT_IMAGE}
        description={
          <p>
            Produk berikut digunakan dalam program SunDY Clinic. Pemesanan dilakukan lewat WhatsApp di{" "}
            {CLINIC_WHATSAPP_DISPLAY}.
          </p>
        }
      />

      <div className="mx-auto max-w-6xl px-4 py-14">
        <p className="rounded-3xl border border-gold-300 bg-cream-100 p-5 text-sm text-brown-700">
          Produk yang mengandung bahan aktif hanya diberikan sesuai anjuran dokter setelah konsultasi.
          Silakan hubungi kami untuk mengetahui produk mana yang sesuai dengan kondisi Anda.
        </p>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product, index) => (
            <Reveal key={product.id} delay={staggerDelay(index)} className="h-full">
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </div>
    </>
  );
}
