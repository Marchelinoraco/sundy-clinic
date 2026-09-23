import type { Metadata } from "next";
import { ProductCard } from "@/components/catalog/product-card";
import { CLINIC_WHATSAPP_DISPLAY } from "@/lib/clinic";
import { getActiveProducts } from "@/server/catalog";

export const metadata: Metadata = {
  title: "Produk",
  description:
    "Produk pendukung program SunDY Clinic Manado. Pemesanan dilakukan lewat WhatsApp setelah konsultasi dokter.",
};

export default async function ProductsPage() {
  const products = await getActiveProducts();

  return (
    <div className="mx-auto max-w-6xl px-4 py-14">
      <h1 className="font-display text-4xl text-brown-900">Produk</h1>
      <p className="mt-3 max-w-2xl text-brown-600">
        Produk berikut digunakan dalam program SunDY Clinic. Pemesanan dilakukan lewat WhatsApp di{" "}
        {CLINIC_WHATSAPP_DISPLAY}.
      </p>

      <p className="mt-6 rounded-2xl border border-gold-300 bg-cream-100 p-5 text-sm text-brown-700">
        Produk yang mengandung bahan aktif hanya diberikan sesuai anjuran dokter setelah konsultasi.
        Silakan hubungi kami untuk mengetahui produk mana yang sesuai dengan kondisi Anda.
      </p>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </div>
  );
}
