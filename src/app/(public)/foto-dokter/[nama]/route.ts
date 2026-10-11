import { findPublicDoctorPhoto } from "@/server/staff-photo";

export const dynamic = "force-dynamic";

/**
 * Foto profil dokter untuk halaman publik (spec profil dokter 4.4). Tanpa login, tetapi hanya foto milik staf aktif yang tampil
 * di situs; nama berkas memuat sidik jari isinya sehingga aman di-cache selamanya.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const { nama } = await params;
  const bytes = await findPublicDoctorPhoto(nama);
  if (!bytes) return new Response("Foto tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
