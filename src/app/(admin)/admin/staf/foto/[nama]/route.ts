import { doctorPhotoName, doctorPhotoUrl } from "@/lib/doctor-profile";
import { can } from "@/lib/permissions";
import { readDoctorPhotoFile } from "@/server/doctor-photo";
import { getCurrentStaff } from "@/server/session";

export const dynamic = "force-dynamic";

/**
 * Pratinjau foto dokter di dialog Ubah. Berbeda dari `/foto-dokter/<nama>`, rute ini tidak peduli apakah dokter sudah tampil di
 * situs (staf baru bawaannya tersembunyi, dan pemilik menyiapkan profilnya dulu), tetapi hanya untuk Super Admin dan tanpa cache.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ nama: string }> }): Promise<Response> {
  const staff = await getCurrentStaff();
  if (!staff) return new Response("Masuk dulu.", { status: 401 });
  if (!can(staff.role, "staff:manage")) return new Response("Anda tidak berhak membuka foto staf.", { status: 403 });

  const { nama } = await params;
  const name = doctorPhotoName(doctorPhotoUrl(String(nama ?? "")));
  if (!name) return new Response("Foto tidak ditemukan.", { status: 404 });
  try {
    const bytes = await readDoctorPhotoFile(name);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/webp", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" },
    });
  } catch {
    return new Response("Foto tidak ditemukan.", { status: 404 });
  }
}
