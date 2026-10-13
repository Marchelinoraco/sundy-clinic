import { can } from "@/lib/permissions";
import { siteServicePhotoName, siteServicePhotoUrl } from "@/lib/service-catalog";
import { readPublicPhoto } from "@/server/public-photo";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/** Pratinjau foto layanan situs di panel: tanpa syarat aktif, hanya untuk pengelola katalog, tanpa cache. */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Masuk dulu.", { status: 401 });
  if (!can(staff.role, "catalog:manage")) return new Response("Anda tidak berhak membuka foto layanan.", { status: 403 });

  const { nama } = await params;
  const name = siteServicePhotoName(siteServicePhotoUrl(String(nama ?? "")));
  if (!name) return new Response("Foto tidak ditemukan.", { status: 404 });
  try {
    const bytes = await readPublicPhoto("layanan", name);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Foto tidak ditemukan.", { status: 404 });
  }
}
