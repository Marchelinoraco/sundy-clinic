import { findPublicSiteServicePhoto } from "@/server/site-service-photo";

export const dynamic = "force-dynamic";

/** Foto layanan situs untuk halaman publik (spec layanan situs 5.3). Cache singkat agar foto layanan yang disembunyikan cepat lenyap. */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const { nama } = await params;
  const bytes = await findPublicSiteServicePhoto(nama);
  if (!bytes) return new Response("Foto tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=300" },
  });
}
