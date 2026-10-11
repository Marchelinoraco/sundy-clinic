import { findPublicDoctorPhoto } from "@/server/staff-photo";

export const dynamic = "force-dynamic";

/**
 * Foto profil dokter untuk halaman publik (spec profil dokter 4.4). Tanpa login, tetapi hanya foto milik staf aktif yang tampil
 * di situs. Cache sengaja singkat (5 menit) supaya foto yang disembunyikan atau dihapus segera berhenti tersaji.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const { nama } = await params;
  const bytes = await findPublicDoctorPhoto(nama);
  if (!bytes) return new Response("Foto tidak ditemukan.", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      // Singkat dengan sengaja: pengoptimal gambar Next.js dan Cloudflare menyimpan sesuai angka ini, dan foto dokter yang disembunyikan
      // atau dihapus harus lenyap dalam hitungan menit, bukan setahun.
      "Cache-Control": "public, max-age=300",
    },
  });
}
