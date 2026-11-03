import { findPublicCategoryPhoto } from "@/server/category-photo";

export const dynamic = "force-dynamic";

/** Foto kategori layanan untuk situs dan pratinjau panel (spec kategori layanan KL9). Nama berkas berubah setiap ganti foto. */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const { nama } = await params;
  const bytes = await findPublicCategoryPhoto(nama);
  if (!bytes) return new Response("Foto tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" },
  });
}
